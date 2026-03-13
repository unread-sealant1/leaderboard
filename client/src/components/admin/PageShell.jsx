import React from "react";
import { motion } from "framer-motion";
import "../../styles/admin.css";

export default function PageShell({ title, subtitle, actions, children }) {
  return (
    <motion.div
      className="pageShell"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <header className="adminTop">
        <div>
          <div className="adminPageTitle">{title}</div>
          <div className="adminPageSub">{subtitle}</div>
        </div>
        {actions ? <div className="adminTopRight">{actions}</div> : null}
      </header>
      <div className="pageBody">{children}</div>
    </motion.div>
  );
}
