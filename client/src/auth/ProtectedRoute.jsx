import React from "react";
import { Navigate } from "react-router-dom";
import { isLoggedIn } from "./auth";

export default function ProtectedRoute({ children }) {
  if (!isLoggedIn()) return <Navigate to="/admin/login" replace />;
  return children;
}