/**
 * One line-icon set for the map, the minimap, the journal and the yearbook.
 * Lucide where it has the thing; the few NITK things it doesn't (a hostel
 * block, a mess thali, the sea, a Yakshagana crown) are drawn on Lucide's
 * 24px grid with its stroke, caps and joins, so they sit in the set.
 */
import {
  createElement,
  Award,
  Banknote,
  Bike,
  BookOpen,
  Briefcase,
  Calendar,
  Camera,
  Check,
  Church,
  Clock,
  CloudRain,
  Code,
  Coffee,
  Crosshair,
  DoorOpen,
  Dumbbell,
  Eye,
  Film,
  FlaskConical,
  Flag,
  Flower,
  GraduationCap,
  Guitar,
  Heart,
  Hospital,
  IdCard,
  Landmark,
  Leaf,
  Library,
  Lightbulb,
  Lighthouse,
  Lock,
  MapPin,
  Mic,
  Moon,
  Music,
  Newspaper,
  Package,
  Palette,
  Plane,
  Presentation,
  Printer,
  School,
  ScrollText,
  Search,
  Shield,
  Sigma,
  Snowflake,
  Sparkles,
  Star,
  Stethoscope,
  Store,
  Sun,
  Telescope,
  Terminal,
  TreePalm,
  Trophy,
  Users,
  Utensils,
  Wallet,
  Wrench,
  X,
} from "lucide";

type IconNode = typeof Bike;

/** A hostel block: three storeys of windows under a pitched tile roof. */
const Hostel: IconNode = [
  ["path", { d: "M3 10 12 4l9 6" }],
  ["path", { d: "M5 9v12h14V9" }],
  ["path", { d: "M8 12h2M14 12h2M8 16h2M14 16h2" }],
  ["path", { d: "M11 21v-3h2v3" }],
  ["path", { d: "M2 21h20" }],
];

/** A mess thali: the steel plate, two katoris and a chapati. */
const Thali: IconNode = [
  ["circle", { cx: "12", cy: "12", r: "9" }],
  ["circle", { cx: "8.5", cy: "9", r: "2" }],
  ["circle", { cx: "15.5", cy: "9", r: "2" }],
  ["path", { d: "M7 15.5a5 3 0 0 0 10 0" }],
];

/** The Arabian Sea: three rolling waves. */
const Sea: IconNode = [
  ["path", { d: "M2 7c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" }],
  ["path", { d: "M2 13c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" }],
  ["path", { d: "M2 19c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" }],
];

/** A Yakshagana kirita: the fanned crown over the painted face. */
const Crown: IconNode = [
  ["path", { d: "M4 12a8 8 0 0 1 16 0" }],
  ["path", { d: "M12 4v3M6.3 6.3l2.1 2.1M17.7 6.3l-2.1 2.1" }],
  ["path", { d: "M7 12h10v2a5 5 0 0 1-10 0z" }],
  ["path", { d: "M10 15h.01M14 15h.01" }],
  ["path", { d: "M9 21h6" }],
];

export const ICONS = {
  award: Award,
  bank: Banknote,
  bike: Bike,
  book: BookOpen,
  briefcase: Briefcase,
  calendar: Calendar,
  camera: Camera,
  check: Check,
  church: Church,
  clock: Clock,
  rain: CloudRain,
  code: Code,
  coffee: Coffee,
  crosshair: Crosshair,
  crown: Crown,
  door: DoorOpen,
  gym: Dumbbell,
  eye: Eye,
  film: Film,
  flask: FlaskConical,
  flag: Flag,
  flower: Flower,
  grad: GraduationCap,
  guitar: Guitar,
  heart: Heart,
  hospital: Hospital,
  hostel: Hostel,
  id: IdCard,
  landmark: Landmark,
  leaf: Leaf,
  library: Library,
  idea: Lightbulb,
  lighthouse: Lighthouse,
  lock: Lock,
  pin: MapPin,
  mic: Mic,
  moon: Moon,
  music: Music,
  news: Newspaper,
  parcel: Package,
  palette: Palette,
  plane: Plane,
  pitch: Presentation,
  printer: Printer,
  school: School,
  scroll: ScrollText,
  search: Search,
  sea: Sea,
  shield: Shield,
  sigma: Sigma,
  snow: Snowflake,
  sparkles: Sparkles,
  star: Star,
  stethoscope: Stethoscope,
  store: Store,
  sun: Sun,
  telescope: Telescope,
  terminal: Terminal,
  thali: Thali,
  palm: TreePalm,
  trophy: Trophy,
  users: Users,
  food: Utensils,
  wallet: Wallet,
  wrench: Wrench,
  x: X,
} satisfies Record<string, IconNode>;

export type IconId = keyof typeof ICONS;

/** An icon as an inline SVG string, for HTML templates. */
export function icon(id: IconId, size = 16, opts: { color?: string; stroke?: number; cls?: string } = {}): string {
  const el = createElement(ICONS[id], {
    width: size,
    height: size,
    stroke: opts.color ?? "currentColor",
    "stroke-width": opts.stroke ?? 2,
    class: `ic${opts.cls ? ` ${opts.cls}` : ""}`,
    "aria-hidden": "true",
  });
  return el.outerHTML;
}

/**
 * Icons for a canvas: each drawn once as an image in a colour, at 3x so
 * they stay crisp on a dense screen. `null` until it has decoded; callers
 * draw the marker's disc alone until then, and redraw on `iconsReady`.
 */
const images = new Map<string, HTMLImageElement>();
const pending = new Set<Promise<unknown>>();

export function iconImage(id: IconId, color = "#ffffff"): HTMLImageElement | null {
  const key = `${id}|${color}`;
  let img = images.get(key);
  if (!img) {
    img = new Image(72, 72);
    // createElement already sets the SVG namespace, so this stands alone as an image.
    const svg = icon(id, 72, { color, stroke: 2.4 });
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    images.set(key, img);
    const p: Promise<void> = img
      .decode()
      .catch((err) => console.error(`[icons] "${id}" did not decode as an image`, err))
      .finally(() => pending.delete(p));
    pending.add(p);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** Resolves once every icon image asked for so far has decoded. */
export function iconsReady(): Promise<void> {
  return Promise.all([...pending]).then(() => undefined);
}
