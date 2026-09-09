
import React from 'react';

export const COLORS = {
  primary: '#0f172a', // Slate 900
  secondary: '#3b82f6', // Blue 500
  accent: '#10b981', // Emerald 500
  warning: '#f59e0b', // Amber 500
  danger: '#ef4444', // Red 500
};

export const Icons = {
  Dashboard: () => <i className="fas fa-chart-line"></i>,
  Inventory: () => <i className="fas fa-boxes-stacked"></i>,
  POS: () => <i className="fas fa-cash-register"></i>,
  Reports: () => <i className="fas fa-file-invoice-dollar"></i>,
  Users: () => <i className="fas fa-users-cog"></i>,
  Logout: () => <i className="fas fa-sign-out-alt"></i>,
  Plus: () => <i className="fas fa-plus"></i>,
  Search: () => <i className="fas fa-search"></i>,
  Trash: () => <i className="fas fa-trash"></i>,
  Edit: () => <i className="fas fa-edit"></i>,
  AI: () => <i className="fas fa-robot"></i>,
  Download: () => <i className="fas fa-download"></i>,
  Upload: () => <i className="fas fa-upload"></i>,
  Settings: () => <i className="fas fa-cog"></i>,
  Printer: () => <i className="fas fa-print"></i>,
};
