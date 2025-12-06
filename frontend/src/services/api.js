import axios from "axios";

const API_BASE_URL = "http://localhost:3002";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export const authAPI = {
  login: (credentials) => api.post("/login", credentials),
  register: (userData) => api.post("/register", userData),
};

export const productAPI = {
  getProducts: () => api.get("/products"),
  createProduct: (productData) => api.post("/products", productData),
  updateProduct: (id, productData) => api.put(`/products/${id}`, productData),
  deleteProduct: (id) => api.delete(`/products/${id}`),
};

export const salesAPI = {
  createSale: (saleData) => api.post("/sales", saleData),
  getSales: () => api.get("/sales"),
};

export const inventoryAPI = {
  getInventory: () => api.get("/inventory"),
  updateInventory: (inventoryData) => api.post("/inventory", inventoryData),
};

export const branchAPI = {
  getBranches: () => api.get("/branches"),
};

export const userAPI = {
  getUsers: () => api.get("/users"),
  updateUser: (id, userData) => api.put(`/users/${id}`, userData),
  deleteUser: (id) => api.delete(`/users/${id}`),
};

export const activityAPI = {
  getActivityLogs: () => api.get("/activity-logs"),
};

export default api;