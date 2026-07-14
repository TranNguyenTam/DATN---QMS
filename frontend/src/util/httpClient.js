const API_URL =
  import.meta.env.VITE_API_URL || `${window.location.origin}/api/v1`;
const REQUEST_TIMEOUT_MS = Number(
  import.meta.env.VITE_HTTP_TIMEOUT_MS || 15000,
);

let isRefreshing = false;
let refreshQueue = [];

const subscribeTokenRefresh = (callback) => {
  refreshQueue.push(callback);
};
const onRefreshed = (result) => {
  refreshQueue.forEach((cb) => cb(result));
  refreshQueue = [];
};

const request = async (url, options = {}) => {
  const token = localStorage.getItem("token");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const config = {
    method: options.method || "GET",
    headers,
    signal: controller.signal,
  };

  if (options.body) {
    config.body = isFormData ? options.body : JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(API_URL + url, config);
  } catch (error) {
    if (error?.name === "AbortError") {
      return Promise.reject(
        new Error("Yêu cầu quá thời gian chờ. Vui lòng thử lại."),
      );
    }
    return Promise.reject(error);
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401) {
    if (!localStorage.getItem("refreshToken")) {
      localStorage.removeItem("token");
      // window.location.href = "/login"; // Cẩn thận dòng này, nó reload trang
      return Promise.reject("Session expired");
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((refreshResult) => {
          if (typeof refreshResult === "string") {
            config.headers.Authorization = `Bearer ${refreshResult}`;
            resolve(fetch(API_URL + url, config).then(parseJSONSafe));
          } else {
            reject(refreshResult);
          }
        });
      });
    }

    isRefreshing = true;

    try {
      const refreshRes = await fetch(API_URL + "/auth/refresh-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refreshToken: localStorage.getItem("refreshToken"),
        }),
      });

      const refreshData = await parseJSONSafe(refreshRes);

      if (!refreshRes.ok) {
        throw new Error("Refresh failed");
      }

      const newToken = refreshData.data?.token;
      const newRefreshToken = refreshData.data?.refreshToken;

      localStorage.setItem("refreshToken", newRefreshToken);
      localStorage.setItem("token", newToken);

      isRefreshing = false;
      onRefreshed(newToken);

      config.headers.Authorization = `Bearer ${newToken}`;
      response = await fetch(API_URL + url, config);
    } catch (err) {
      isRefreshing = false;
      refreshQueue.forEach((cb) =>
        cb(Promise.reject("Refresh Failed, session ended")),
      );
      refreshQueue = [];

      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      window.location.href = "/login";
      return Promise.reject(err);
    }
  }

  return parseJSONSafe(response);
};

const parseJSONSafe = async (response) => {
  try {
    const data = await response.json();
    return response.ok ? data : Promise.reject(data);
  } catch {
    return response.ok ? {} : Promise.reject("Unknown Error");
  }
};

const http = {
  get: (url, params = {}, config = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`${url}?${query}`, { ...config, method: "GET" });
  },
  post: (url, body = {}, config = {}) =>
    request(url, { ...config, method: "POST", body }),
  postForm: (url, formData, config = {}) =>
    request(url, { ...config, method: "POST", body: formData }),
  put: (url, body = {}, config = {}) =>
    request(url, { ...config, method: "PUT", body }),
  patch: (url, body = {}, config = {}) =>
    request(url, { ...config, method: "PATCH", body }),
  del: (url, params = {}, config = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`${url}?${query}`, { ...config, method: "DELETE" });
  },
  upload: (url, file, config = {}) => {
    const formData = new FormData();
    formData.append("file", file);
    return fetch(API_URL + url, {
      method: "POST",
      headers: {
        ...(config.headers || {}),
        Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
      },
      body: formData,
    }).then(parseJSONSafe);
  },
};

export default http;
