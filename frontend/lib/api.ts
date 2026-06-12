import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://thinktls-api.onrender.com/api";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 35000, // 35s — covers Render free-tier cold-start (~30s)
  withCredentials: true, // send httpOnly cookie on every request
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    // Fallback: also send Bearer header if a token exists in localStorage
    // (supports sessions created before the cookie migration)
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    // Only redirect to login for 401s that happen OUTSIDE the login page itself
    const onLoginPage = typeof window !== "undefined" && window.location.pathname === "/login";
    if (err.response?.status === 401 && !onLoginPage && typeof window !== "undefined") {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
