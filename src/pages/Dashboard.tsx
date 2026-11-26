import { useState, useEffect } from "react";
import { isPlatformMode, type NavUser } from "../components/shell/navigation";
import SuperAdminDashboard from "./SuperAdminDashboard";
import CompanyDashboard from "./CompanyDashboard";

export default function Dashboard() {
  const [user, setUser] = useState<NavUser | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handleStorage = () => {
      try {
        setUser(JSON.parse(localStorage.getItem("user") || "null"));
      } catch {
        setUser(null);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  if (isPlatformMode(user)) {
    return <SuperAdminDashboard />;
  }

  return <CompanyDashboard />;
}
