import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm dusk base palette — every page picks this up automatically.
        bg: "#0e0805",
        panel: "#1c130a",
        border: "#3a2418",
        ink: "#ede1cb",
        mute: "#9a8466",
        accent: "#f5a85e",
        dusk: {
          // sky gradient stops (zenith → horizon)
          zenith: "#2d1b4e",
          mid: "#7a3a5c",
          horizon: "#e8783c",
          glow: "#f4b860",
          // ground & silhouettes
          ground: "#3a2818",
          hill: "#3d2447",
          // tree
          bark: "#4a2f1a",
          barkDark: "#1f1209",
          rim: "#f5a85e",
          // nodes
          leafLit: "#a8c66a",
          leafDark: "#4a5d3a",
          fruitLit: "#e8783c",
          fruitDark: "#a83e1c",
          fruitGold: "#f5c54b",
          flowerLit: "#e89a8a",
          flowerDark: "#6b4570",
          sproutLit: "#d4e09b",
          sproutDark: "#7ba05b",
          // hole
          holeCore: "#0a0506",
          holeRing: "#3a1e10",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      keyframes: {
        "node-grow": {
          "0%": { transform: "scale(0)", opacity: "0" },
          "60%": { transform: "scale(1.15)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "fly-into-hole": {
          "0%": { transform: "translate(0,0) scale(1)", opacity: "1" },
          "60%": { opacity: "1" },
          "100%": { transform: "translate(var(--hole-dx),var(--hole-dy)) scale(0.05)", opacity: "0" },
        },
        "hole-breathe": {
          "0%, 100%": { filter: "drop-shadow(0 0 6px rgba(245,168,94,0.35))" },
          "50%": { filter: "drop-shadow(0 0 16px rgba(245,168,94,0.7))" },
        },
        "firefly-drift": {
          "0%": { transform: "translate(0,0)", opacity: "0.2" },
          "25%": { transform: "translate(20px,-15px)", opacity: "0.9" },
          "50%": { transform: "translate(-10px,-30px)", opacity: "0.5" },
          "75%": { transform: "translate(15px,-10px)", opacity: "0.8" },
          "100%": { transform: "translate(0,0)", opacity: "0.2" },
        },
        "leaf-sway": {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
        "fruit-fall": {
          "0%": { transform: "translateY(0) rotate(0deg)", opacity: "1" },
          "60%": { opacity: "1" },
          "100%": { transform: "translateY(120px) rotate(180deg)", opacity: "0" },
        },
      },
      animation: {
        "node-grow": "node-grow 700ms cubic-bezier(.34,1.56,.64,1) both",
        "fly-into-hole": "fly-into-hole 800ms ease-in forwards",
        "hole-breathe": "hole-breathe 3.5s ease-in-out infinite",
        "firefly-drift": "firefly-drift 8s ease-in-out infinite",
        "leaf-sway": "leaf-sway 4s ease-in-out infinite",
        "fruit-fall": "fruit-fall 1100ms cubic-bezier(.55,.05,.85,.5) forwards",
      },
    },
  },
  plugins: [],
} satisfies Config;
