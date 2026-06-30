import defaultTheme from "tailwindcss/defaultTheme";

export default {
    content: ["./index.html", "./lib/**/*.{js,ts,jsx,tsx}", "./stories/**/*.{js,ts,jsx,tsx}"],
    darkMode: "selector",
    theme: {
        extend: {
            fontFamily: {
                sans: ["Inter", ...defaultTheme.fontFamily.sans],
                montserrat: ["Montserrat"],
            },
            dropShadow: {
                glow: ["0 0 4px #0033ff"],
                "glow-dark": ["0 0 4px #03f"],
                "glow-disabled": ["0 0 4px #888"],
                "glow-dark-disabled": ["0 0 4px #333"],
            },
        },
    },
    plugins: [],
};
