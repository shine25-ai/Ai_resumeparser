import {
  Award, Briefcase, CalendarCheck, Coffee, Cpu, Gift, Globe, GraduationCap, Handshake, Heart, HeartPulse, Home,
  Laptop, Leaf, Lightbulb, Rocket, ShieldCheck, Smile, Sparkles, Star, Target, TrendingUp, Trophy, Users, Wallet, Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Icons a company can pick for highlights, benefits and "life at" items (stored by name, e.g. "rocket").
 * Kept to a short list so the careers bundle stays small.
 */
export const CAREER_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  rocket: { icon: Rocket, label: "Rocket" },
  users: { icon: Users, label: "People" },
  "trending-up": { icon: TrendingUp, label: "Growth" },
  heart: { icon: Heart, label: "Heart" },
  "calendar-check": { icon: CalendarCheck, label: "Flexible work" },
  gift: { icon: Gift, label: "Gift" },
  award: { icon: Award, label: "Award" },
  laptop: { icon: Laptop, label: "Laptop" },
  "shield-check": { icon: ShieldCheck, label: "Insurance" },
  "graduation-cap": { icon: GraduationCap, label: "Learning" },
  briefcase: { icon: Briefcase, label: "Briefcase" },
  globe: { icon: Globe, label: "Global" },
  coffee: { icon: Coffee, label: "Coffee" },
  sparkles: { icon: Sparkles, label: "Sparkles" },
  star: { icon: Star, label: "Star" },
  cpu: { icon: Cpu, label: "Technology" },
  home: { icon: Home, label: "Remote" },
  "heart-pulse": { icon: HeartPulse, label: "Health" },
  trophy: { icon: Trophy, label: "Bonus" },
  handshake: { icon: Handshake, label: "Culture" },
  lightbulb: { icon: Lightbulb, label: "Ideas" },
  target: { icon: Target, label: "Goals" },
  leaf: { icon: Leaf, label: "Wellness" },
  zap: { icon: Zap, label: "Energy" },
  smile: { icon: Smile, label: "Fun" },
  wallet: { icon: Wallet, label: "Salary" },
};

/** A sensible icon for a benefit or highlight from its words, when none was picked. */
export function guessIcon(text: string): string {
  const t = text.toLowerCase();
  const rules: [RegExp, string][] = [
    [/salary|pay|compensation|bonus|stock|esop/, "wallet"],
    [/health|medical|insurance/, "shield-check"],
    [/learn|course|training|certif|growth path|mentor/, "graduation-cap"],
    [/flex|hybrid|remote|work from|hours/, "calendar-check"],
    [/team|people|culture|together|collab/, "users"],
    [/grow|career|promotion/, "trending-up"],
    [/award|recogn|perform/, "trophy"],
    [/ai|tech|engineering|product/, "cpu"],
    [/well|yoga|balance/, "leaf"],
    [/global|world|international/, "globe"],
    [/purpose|impact|care/, "heart"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] || "sparkles";
}

export function CareerIcon({ name, text = "", size = 20, className = "" }: { name?: string; text?: string; size?: number; className?: string }) {
  const entry = CAREER_ICONS[name || ""] || CAREER_ICONS[guessIcon(text)];
  const Icon = entry.icon;
  return <Icon size={size} className={className} aria-hidden />;
}
