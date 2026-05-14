const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === "string" ? payload : payload.detail || "Request failed";
    throw new Error(Array.isArray(message) ? message.map((item) => item.msg).join(", ") : message);
  }
  return payload;
}

export const api = {
  health: () => request("/api/health"),
  config: () => request("/api/admin/config"),
  saveConfig: (config) => request("/api/admin/config", { method: "PUT", body: config }),
  resetSeed: () => request("/api/admin/seed/reset", { method: "POST" }),
  preview: (body) => request("/api/calculations/preview", { method: "POST", body }),
  previewAdvanced: (body) => request("/api/advanced-calculations/preview", { method: "POST", body }),
  scenarios: () => request("/api/scenarios"),
  saveScenario: (body) => request("/api/scenarios", { method: "POST", body }),
  deleteScenario: (id) => request(`/api/scenarios/${id}`, { method: "DELETE" }),
  advancedScenarios: () => request("/api/advanced-scenarios"),
  saveAdvancedScenario: (body) => request("/api/advanced-scenarios", { method: "POST", body }),
  deleteAdvancedScenario: (id) => request(`/api/advanced-scenarios/${id}`, { method: "DELETE" }),
};
