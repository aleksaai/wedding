import React from "react";
import { createRoot } from "react-dom/client";
import { InvitationEntry } from "./InvitationEntry.jsx";
import "./styles.css";
import "./admin/admin.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <InvitationEntry />
  </React.StrictMode>,
);
