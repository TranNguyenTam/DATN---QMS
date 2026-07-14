using System.Security.Cryptography;

namespace Qms.API.Services;

/// <summary>
/// Mã hóa embedding khuôn mặt theo AES-256-GCM.
/// Layout output: [nonce (12B)] [ciphertext (N B)] [tag (16B)].
///
/// Khóa lấy từ config "Face:EncryptionKey" (hex 64 ký tự = 32 byte).
/// Nếu chưa cấu hình, service sẽ sinh khóa tạm và log cảnh báo — chỉ phù hợp
/// dev. Production phải nạp qua biến môi trường / secret store.
/// </summary>
public interface IFaceCryptoService
{
    string KeyId { get; }
    byte[] Encrypt(float[] embedding);
    float[] Decrypt(byte[] blob);
}

public class FaceCryptoService : IFaceCryptoService
{
    private const int NonceSize = 12;
    private const int TagSize = 16;

    private readonly byte[] _key;
    public string KeyId { get; }

    public FaceCryptoService(IConfiguration config, IHostEnvironment env, ILogger<FaceCryptoService> log)
    {
        var hex = config["Face:EncryptionKey"];
        if (string.IsNullOrWhiteSpace(hex))
        {
            // Fail-fast ngoài Development: khóa rỗng -> khóa tạm RAM -> restart làm
            // toàn bộ embedding không giải mã được (recognize nobody, im lặng). Không
            // cho phép trạng thái này ở Production/Staging.
            if (!env.IsDevelopment())
            {
                throw new InvalidOperationException(
                    "Face:EncryptionKey BẮT BUỘC ở môi trường non-Development. " +
                    "Nạp khóa 64 hex qua env Face__EncryptionKey hoặc secret store.");
            }
            _key = RandomNumberGenerator.GetBytes(32);
            KeyId = "dev-ephemeral";
            log.LogCritical(
                "Face:EncryptionKey CHƯA cấu hình (Development). Dùng khóa TẠM trong RAM " +
                "— mọi embedding enroll sẽ KHÔNG đọc lại được sau restart. " +
                "Hãy cấu hình khóa cố định để demo ổn định.");
        }
        else
        {
            _key = Convert.FromHexString(hex.Trim());
            if (_key.Length != 32)
            {
                throw new InvalidOperationException(
                    "Face:EncryptionKey phải là 64 ký tự hex (AES-256).");
            }
            KeyId = config["Face:KeyId"] ?? "prod-v1";
        }
    }

    public byte[] Encrypt(float[] embedding)
    {
        var plain = new byte[embedding.Length * sizeof(float)];
        Buffer.BlockCopy(embedding, 0, plain, 0, plain.Length);

        var nonce = RandomNumberGenerator.GetBytes(NonceSize);
        var cipher = new byte[plain.Length];
        var tag = new byte[TagSize];

        using var aes = new AesGcm(_key, TagSize);
        aes.Encrypt(nonce, plain, cipher, tag);

        var blob = new byte[NonceSize + cipher.Length + TagSize];
        Buffer.BlockCopy(nonce, 0, blob, 0, NonceSize);
        Buffer.BlockCopy(cipher, 0, blob, NonceSize, cipher.Length);
        Buffer.BlockCopy(tag, 0, blob, NonceSize + cipher.Length, TagSize);
        return blob;
    }

    public float[] Decrypt(byte[] blob)
    {
        if (blob.Length <= NonceSize + TagSize)
        {
            throw new InvalidOperationException("Blob quá ngắn, không phải AES-GCM hợp lệ.");
        }

        var nonce = new byte[NonceSize];
        var tag = new byte[TagSize];
        var cipher = new byte[blob.Length - NonceSize - TagSize];

        Buffer.BlockCopy(blob, 0, nonce, 0, NonceSize);
        Buffer.BlockCopy(blob, NonceSize, cipher, 0, cipher.Length);
        Buffer.BlockCopy(blob, NonceSize + cipher.Length, tag, 0, TagSize);

        var plain = new byte[cipher.Length];
        using var aes = new AesGcm(_key, TagSize);
        aes.Decrypt(nonce, cipher, tag, plain);

        if (plain.Length % sizeof(float) != 0)
        {
            throw new InvalidOperationException("Plaintext không chia hết cho sizeof(float).");
        }
        var vec = new float[plain.Length / sizeof(float)];
        Buffer.BlockCopy(plain, 0, vec, 0, plain.Length);
        return vec;
    }
}
