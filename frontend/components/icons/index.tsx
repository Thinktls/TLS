"use client";
import { forwardRef } from "react";
import {
  // Commodity / hardware
  Laptop, Monitor, Server, Globe, Database, Mouse, Package,
  // Status
  CheckCircle2, XCircle, AlertTriangle, Clock, Zap, Info,
  // Navigation
  LayoutDashboard, GitBranch, Users, BarChart3, Settings, HelpCircle, MessageSquare,
  UserCheck, SlidersHorizontal, FileText,
  // Actions / chrome
  Plus, X, ChevronDown, ChevronRight, ChevronLeft, Search, Upload, Download,
  Pencil, Trash2, Copy, LogOut, Bell, Sun, Moon, Menu, Mail, Send, Eye, EyeOff,
  ArrowRight, ArrowLeft, RefreshCw, Loader2, ExternalLink,
  type LucideIcon, type LucideProps,
} from "lucide-react";

/** Central registry — every icon used in the app must be named here. Keeps the icon set closed
 * and typed, instead of importing lucide icons ad-hoc across components. */
export const ICONS = {
  // Commodity
  laptop: Laptop,
  monitor: Monitor,
  server: Server,
  globe: Globe,
  database: Database,
  mouse: Mouse,
  package: Package,
  // Status
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  clock: Clock,
  zap: Zap,
  info: Info,
  // Navigation
  dashboard: LayoutDashboard,
  rounds: GitBranch,
  buyers: Users,
  compare: SlidersHorizontal,
  fluff: SlidersHorizontal,
  reports: BarChart3,
  ai: MessageSquare,
  guide: HelpCircle,
  userCheck: UserCheck,
  file: FileText,
  // Chrome / actions
  plus: Plus,
  close: X,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  search: Search,
  upload: Upload,
  download: Download,
  edit: Pencil,
  delete: Trash2,
  copy: Copy,
  logout: LogOut,
  bell: Bell,
  sun: Sun,
  moon: Moon,
  menu: Menu,
  mail: Mail,
  send: Send,
  eye: Eye,
  eyeOff: EyeOff,
  arrowRight: ArrowRight,
  arrowLeft: ArrowLeft,
  refresh: RefreshCw,
  spinner: Loader2,
  externalLink: ExternalLink,
} as const;

export type IconName = keyof typeof ICONS;

const SIZE_MAP = { xs: 12, sm: 16, md: 20, lg: 24, xl: 32 } as const;
export type IconSize = keyof typeof SIZE_MAP;

export interface IconProps extends Omit<LucideProps, "size" | "ref"> {
  name: IconName;
  size?: IconSize | number;
  /** Applies the spin animation (for name="spinner" on loading states). */
  spin?: boolean;
}

/**
 * Semantic icon component — the single way to render an icon in this app.
 * Usage: <Icon name="laptop" size="sm" />
 */
export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { name, size = "md", strokeWidth = 2, spin, className, ...rest },
  ref
) {
  const Component: LucideIcon = ICONS[name];
  const px = typeof size === "number" ? size : SIZE_MAP[size];
  return (
    <Component
      ref={ref}
      size={px}
      strokeWidth={strokeWidth}
      className={[spin ? "animate-spin" : "", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
});
