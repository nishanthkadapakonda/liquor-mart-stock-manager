import axios from "axios";

const rawBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const baseURL = rawBaseUrl.endsWith("/api") ? rawBaseUrl : `${rawBaseUrl}/api`;

export const TOKEN_STORAGE_KEY = "lm_auth_token";

export const api = axios.create({
  baseURL,
  withCredentials: false,
});

export function setAuthHeader(token?: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null
  ) {
    const response = error.response as { data?: { message?: string }; status?: number };
    return response.data?.message ?? `Request failed${response.status ? ` (${response.status})` : ""}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong, please try again.";
}
