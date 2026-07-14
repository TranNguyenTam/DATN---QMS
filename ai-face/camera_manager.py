import cv2
import time
import logging
import threading
from typing import Optional, Tuple, Callable, List
from dataclasses import dataclass
from queue import Queue, Empty
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class CameraConfig:
    """Camera configuration"""
    ip: str = "192.168.1.6"
    port: int = 554
    username: str = "admin"
    password: str = "CHANGE_ME"
    channel: int = 1
    stream: int = 1  # 1 = Main stream, 2 = Sub stream
    width: int = 1920
    height: int = 1080
    fps: int = 25
    process_width: int = 960    # Resize for AI processing
    process_height: int = 540
    reconnect_delay: int = 3
    max_reconnect_attempts: int = 15
    buffer_size: int = 0        # Zero buffer for real-time
    connection_timeout: int = 10
    read_timeout: int = 5
    transport: str = "tcp"      # TCP for reliable streaming
    use_hw_accel: bool = False  # Hardware acceleration
    hw_decoder: str = "cuda"    # cuda, dxva2, d3d11va


class HikvisionCamera:
    
    def __init__(self, config = None):
        if isinstance(config, CameraConfig):
            self.config = config
        else:
            self.config = self._parse_config(config or {})
        
        self.cap: Optional[cv2.VideoCapture] = None
        self.is_connected = False
        self.is_running = False
        
        # Threading
        self._frame_queue = Queue(maxsize=10)
        self._capture_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        
        # Stats
        self.frames_captured = 0
        self.frames_dropped = 0
        self.last_frame_time = 0
        self.connection_attempts = 0
        
        # Callbacks
        self.on_connect: Optional[Callable] = None
        self.on_disconnect: Optional[Callable] = None
        self.on_error: Optional[Callable[[str], None]] = None
        
        logger.info(f"Camera manager initialized for {self.config.ip}")
    
    def _parse_config(self, config: dict) -> CameraConfig:
        return CameraConfig(
            ip=config.get('ip', '192.168.1.6'),
            port=config.get('port', 554),
            username=config.get('username', 'admin'),
            password=config.get('password', 'CHANGE_ME'),
            channel=config.get('channel', 1),
            stream=config.get('stream', 1),
            width=config.get('width', 2560),
            height=config.get('height', 1440),
            fps=config.get('fps', 25),
            process_width=config.get('process_width', 1280),
            process_height=config.get('process_height', 720),
            reconnect_delay=config.get('reconnect_delay', 3),
            max_reconnect_attempts=config.get('max_reconnect_attempts', 15),
            buffer_size=config.get('buffer_size', 1),
            connection_timeout=config.get('connection_timeout', 10),
            read_timeout=config.get('read_timeout', 5),
            transport=config.get('transport', 'tcp'),
            use_hw_accel=config.get('use_hw_accel', False),
            hw_decoder=config.get('hw_decoder', 'cuda'),
        )
    
    def get_rtsp_url(self, stream_type: int = None) -> str:
        """
        Generate RTSP URL for Hikvision camera
        
        Hikvision URL formats:
        - Main stream: rtsp://user:pass@ip:554/Streaming/Channels/101
        - Sub stream:  rtsp://user:pass@ip:554/Streaming/Channels/102
        - Alternative: rtsp://user:pass@ip:554/h264/ch1/main/av_stream
        """
        stream = stream_type or self.config.stream
        channel_id = self.config.channel * 100 + stream
        
        # Primary URL format (most compatible)
        url = (
            f"rtsp://{self.config.username}:{self.config.password}@"
            f"{self.config.ip}:{self.config.port}/Streaming/Channels/{channel_id}"
        )
        return url
    
    def get_alternative_rtsp_url(self) -> str:
        """Alternative RTSP URL format for older Hikvision models"""
        stream_name = "main" if self.config.stream == 1 else "sub"
        url = (
            f"rtsp://{self.config.username}:{self.config.password}@"
            f"{self.config.ip}:{self.config.port}/h264/ch{self.config.channel}/{stream_name}/av_stream"
        )
        return url
    
    def connect(self, force: bool = False) -> bool:
        """
        Connect to camera RTSP stream
        
        Args:
            force: Force reconnect even if already connected
        
        Returns:
            True if connection successful
        """
        if self.is_connected and not force:
            logger.warning("Already connected")
            return True
        
        # If force reconnect, disconnect first
        if force and self.is_connected:
            logger.info("Force reconnect - disconnecting first...")
            self._release_capture()
        
        rtsp_url = self.get_rtsp_url()
        logger.info(f"Connecting to camera: {self.config.ip}")
        
        try:
            # Build FFMPEG options for MINIMUM LATENCY
            # Key settings to reduce delay:
            # - fflags: nobuffer, flush_packets - disable buffering
            # - flags: low_delay - enable low delay mode
            # - framedrop - drop frames if needed to keep up
            # - tune: zerolatency - optimize for zero latency
            ffmpeg_options = (
                f"rtsp_transport;{self.config.transport}|"
                f"fflags;nobuffer|"          # Disable buffering
                f"flags;low_delay|"          # Enable low delay mode  
                f"framedrop;1|"              # Allow frame dropping
                f"max_delay;0|"              # No delay
                f"reorder_queue_size;0"      # No reordering queue
            )
            
            # Hardware acceleration if available
            if self.config.use_hw_accel:
                if self.config.hw_decoder == "cuda":
                    ffmpeg_options += "|hwaccel;cuda"
                elif self.config.hw_decoder == "dxva2":
                    ffmpeg_options += "|hwaccel;dxva2"
            
            # Set environment for FFMPEG - suppress warnings
            import os
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = ffmpeg_options
            os.environ["OPENCV_LOG_LEVEL"] = "ERROR"  # Reduce FFMPEG log spam
            
            # OpenCV VideoCapture with RTSP
            self.cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
            
            # CRITICAL: Set minimum buffer size for lowest latency
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Only 1 frame buffer
            
            # Set timeouts (in milliseconds)
            self.cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, self.config.connection_timeout * 1000)
            self.cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, self.config.read_timeout * 1000)
            
            # Set resolution hints
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.height)
            self.cap.set(cv2.CAP_PROP_FPS, self.config.fps)
            
            # Check if connected
            if not self.cap.isOpened():
                # Try alternative URL format
                logger.warning("Primary URL failed, trying alternative format...")
                alt_url = self.get_alternative_rtsp_url()
                self.cap = cv2.VideoCapture(alt_url, cv2.CAP_FFMPEG)
                self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            
            if self.cap.isOpened():
                # Read a test frame
                ret, frame = self.cap.read()
                if ret and frame is not None:
                    self.is_connected = True
                    self.connection_attempts = 0
                    actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    actual_fps = self.cap.get(cv2.CAP_PROP_FPS)
                    logger.info(f" Connected to camera: {actual_width}x{actual_height} @ {actual_fps}fps")
                    
                    if self.on_connect:
                        self.on_connect()
                    return True
            
            logger.error(" Failed to connect to camera")
            self._handle_error("Connection failed - could not open stream")
            return False
            
        except Exception as e:
            logger.error(f" Connection error: {e}")
            self._handle_error(str(e))
            return False
    
    def _release_capture(self):
        """Release video capture without full disconnect"""
        self.is_connected = False
        if self.cap:
            try:
                self.cap.release()
            except:
                pass
            self.cap = None
    
    def reconnect(self) -> bool:
        """Force reconnect to camera"""
        logger.info("🔄 Reconnecting to camera...")
        return self.connect(force=True)
    
    def disconnect(self):
        """Disconnect from camera"""
        self.is_running = False
        self.is_connected = False
        
        if self._capture_thread and self._capture_thread.is_alive():
            self._capture_thread.join(timeout=2)
        
        if self.cap:
            self.cap.release()
            self.cap = None
        
        logger.info("Disconnected from camera")
        
        if self.on_disconnect:
            self.on_disconnect()
    
    def start_capture(self):
        """Start background frame capture thread"""
        if not self.is_connected:
            if not self.connect():
                return False
        
        self.is_running = True
        self._capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._capture_thread.start()
        logger.info("Started frame capture thread")
        return True
    
    def stop_capture(self):
        """Stop frame capture"""
        self.is_running = False
        if self._capture_thread:
            self._capture_thread.join(timeout=2)
        logger.info("Stopped frame capture")
    
    def _capture_loop(self):
        """Background frame capture loop"""
        consecutive_failures = 0
        max_failures = 30  # ~1 second at 30fps
        
        while self.is_running:
            if not self.is_connected or self.cap is None:
                time.sleep(0.1)
                continue
            
            try:
                ret, frame = self.cap.read()    
                
                if ret and frame is not None:
                    consecutive_failures = 0
                    self.frames_captured += 1
                    self.last_frame_time = time.time()
                    
                    # Add to queue, drop oldest if full
                    if self._frame_queue.full():
                        try:
                            self._frame_queue.get_nowait()
                            self.frames_dropped += 1
                        except Empty:
                            pass
                    
                    self._frame_queue.put(frame)
                else:
                    consecutive_failures += 1
                    if consecutive_failures >= max_failures:
                        logger.warning("Too many frame failures, attempting reconnect...")
                        self._reconnect()
                        consecutive_failures = 0
                        
            except Exception as e:
                logger.error(f"Capture error: {e}")
                consecutive_failures += 1
                if consecutive_failures >= max_failures:
                    self._reconnect()
                    consecutive_failures = 0
    
    def _reconnect(self):
        """Attempt to reconnect to camera"""
        self.is_connected = False
        self.connection_attempts += 1
        
        if self.connection_attempts > self.config.max_reconnect_attempts:
            logger.error("Max reconnection attempts reached")
            self._handle_error("Max reconnection attempts reached")
            self.is_running = False
            return
        
        logger.info(f"Reconnecting... (attempt {self.connection_attempts})")
        
        if self.cap:
            self.cap.release()
        
        time.sleep(self.config.reconnect_delay)
        
        if self.connect():
            logger.info("Reconnection successful")
        else:
            logger.warning("Reconnection failed, will retry...")
    
    def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        """
        Read a frame from the camera
        
        Returns:
            Tuple of (success, frame)
        """
        if not self.is_running:
            # Direct read mode
            if self.cap and self.is_connected:
                return self.cap.read()
            return False, None
        
        # Threaded mode - get from queue
        try:
            frame = self._frame_queue.get(timeout=1.0)
            return True, frame
        except Empty:
            return False, None
    
    def read_latest(self) -> Tuple[bool, Optional[np.ndarray]]:
        """Read the latest frame, discarding older frames"""
        frame = None
        while not self._frame_queue.empty():
            try:
                frame = self._frame_queue.get_nowait()
            except Empty:
                break
        
        if frame is not None:
            return True, frame
        return False, None
    
    def read_for_processing(self) -> Tuple[bool, Optional[np.ndarray], Optional[np.ndarray]]:
        """
        Read frame and return both original and resized for AI processing
        
        Returns:
            Tuple of (success, original_frame, processed_frame)
            - original_frame: Full resolution for display/recording
            - processed_frame: Resized for AI inference (faster)
        """
        ret, frame = self.read_latest()
        if not ret or frame is None:
            return False, None, None
        
        # Resize for AI processing if needed
        process_size = (self.config.process_width, self.config.process_height)
        current_size = (frame.shape[1], frame.shape[0])
        
        if current_size != process_size:
            processed = cv2.resize(
                frame, 
                process_size, 
                interpolation=cv2.INTER_LINEAR
            )
        else:
            processed = frame
        
        return True, frame, processed
    
    def _handle_error(self, message: str):
        """Handle errors"""
        if self.on_error:
            self.on_error(message)
    
    def get_stats(self) -> dict:
        """Get camera statistics"""
        return {
            "connected": self.is_connected,
            "running": self.is_running,
            "frames_captured": self.frames_captured,
            "frames_dropped": self.frames_dropped,
            "queue_size": self._frame_queue.qsize(),
            "connection_attempts": self.connection_attempts,
            "last_frame_time": self.last_frame_time,
        }
    
    def __enter__(self):
        """Context manager entry"""
        self.connect()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.disconnect()


def load_camera_configs(config_path: str) -> List[CameraConfig]:
    """
    Load camera configurations from YAML file
    
    Args:
        config_path: Path to config.yaml
        
    Returns:
        List of CameraConfig objects
    """
    import yaml
    
    with open(config_path, 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f)

    # Support both schemas:
    # 1) legacy: camera: { ... , cameras: [...] }
    # 2) current: global: {...}, cameras: [...]
    cameras = config.get('camera', {}).get('cameras', []) or config.get('cameras', [])
    default = (
        config.get('camera', {})
        if config.get('camera', {}).get('cameras') is not None
        else config.get('global', {})
    )
    
    configs = []
    for cam in cameras:
        cfg = CameraConfig(
            ip=cam.get('ip', default.get('ip', '192.168.1.6')),
            port=cam.get('port', default.get('port', 554)),
            username=cam.get('username', default.get('username', 'admin')),
            password=cam.get('password', default.get('password', '')),
            channel=cam.get('channel', default.get('channel', 1)),
            stream=cam.get('stream', default.get('stream', 1)),
            width=cam.get('width', default.get('width', 2560)),
            height=cam.get('height', default.get('height', 1440)),
            fps=cam.get('fps', default.get('fps', 25)),
            reconnect_delay=default.get('reconnect_delay', 3),
            max_reconnect_attempts=default.get('max_reconnect_attempts', 15),
            process_width=default.get('process_width', 1280),
            process_height=default.get('process_height', 720),
            buffer_size=default.get('buffer_size', 1),
            connection_timeout=default.get('connection_timeout', 10),
            read_timeout=default.get('read_timeout', 5),
            transport=default.get('transport', 'tcp'),
            use_hw_accel=default.get('use_hw_accel', False),
            hw_decoder=default.get('hw_decoder', 'cuda'),
        )
        configs.append(cfg)
    
    return configs


class MultiCameraManager:
    """Manage multiple cameras"""
    
    def __init__(self):
        self.cameras: dict[str, HikvisionCamera] = {}
    
    def add_camera(self, camera_id: str, config: dict) -> HikvisionCamera:
        """Add a camera"""
        camera = HikvisionCamera(config)
        self.cameras[camera_id] = camera
        return camera
    
    def remove_camera(self, camera_id: str):
        """Remove a camera"""
        if camera_id in self.cameras:
            self.cameras[camera_id].disconnect()
            del self.cameras[camera_id]
    
    def get_camera(self, camera_id: str) -> Optional[HikvisionCamera]:
        """Get a camera by ID"""
        return self.cameras.get(camera_id)
    
    def connect_all(self):
        """Connect all cameras"""
        for camera_id, camera in self.cameras.items():
            logger.info(f"Connecting camera: {camera_id}")
            camera.connect()
    
    def disconnect_all(self):
        """Disconnect all cameras"""
        for camera in self.cameras.values():
            camera.disconnect()
    
    def get_all_stats(self) -> dict:
        """Get stats for all cameras"""
        return {
            camera_id: camera.get_stats()
            for camera_id, camera in self.cameras.items()
        }


# Test function
def test_camera_connection():
    """Test camera connection"""
    config = {
        'ip': '192.168.1.6',
        'username': 'admin',
        'password': 'CHANGE_ME',
        'channel': 1,
        'stream': 2,  # Use sub stream for faster testing
    }
    
    camera = HikvisionCamera(config)
    
    print("Testing camera connection...")
    print(f"RTSP URL: {camera.get_rtsp_url()}")
    
    if camera.connect():
        print(" Connection successful!")
        
        # Read a few frames
        for i in range(10):
            ret, frame = camera.read()
            if ret:
                print(f"  Frame {i+1}: {frame.shape}")
                # Show frame
                cv2.imshow('Camera Test', frame)
                if cv2.waitKey(100) & 0xFF == ord('q'):
                    break
        
        camera.disconnect()
        cv2.destroyAllWindows()
    else:
        print(" Connection failed!")
        print("Trying alternative URL...")
        print(f"Alternative URL: {camera.get_alternative_rtsp_url()}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    test_camera_connection()
