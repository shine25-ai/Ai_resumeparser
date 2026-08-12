import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

const ROUTE_PERMISSION_MAP: Record<string, string> = {
  "/": "dashboard",
  "/upload": "upload",
  "/database": "database",
  "/evaluation": "evaluation",
  "/jd-match": "jd-match",
  "/interviews": "interviews",
  "/interview-dashboard": "interview-dashboard",
  "/client-feedback": "client-feedback",
  "/analytics": "analytics",
  "/settings": "settings",
};

export const ProtectedRoute: React.FC = () => {
  const location = useLocation();
  const accessToken = localStorage.getItem("access_token");
  const refreshToken = localStorage.getItem("refresh_token");
  const userStr = localStorage.getItem("user");

  if (!accessToken || !refreshToken || !userStr) {
    return <Navigate to="/login" replace />;
  }

  try {
    const user = JSON.parse(userStr);
    // If admin or no explicit permissions set, allow all protected routes
    if (user.role === "admin" || !user.permissions || user.permissions.length === 0) {
      return <Outlet />;
    }

    const currentPath = location.pathname;
    // Find matching base route
    const matchingRouteKey = Object.keys(ROUTE_PERMISSION_MAP).find(
      (path) => currentPath === path || (path !== "/" && currentPath.startsWith(path))
    );

    if (matchingRouteKey) {
      const requiredPerm = ROUTE_PERMISSION_MAP[matchingRouteKey];
      if (requiredPerm && !user.permissions.includes(requiredPerm)) {
        // Redirect unauthorized user to the first path they actually have permission for
        const allowedPath = Object.keys(ROUTE_PERMISSION_MAP).find(
          (p) => user.permissions.includes(ROUTE_PERMISSION_MAP[p])
        ) || "/";
        
        if (allowedPath !== currentPath) {
          return <Navigate to={allowedPath} replace />;
        }
      }
    }
  } catch (e) {
    console.error("Error evaluating route permissions:", e);
  }

  return <Outlet />;
};
