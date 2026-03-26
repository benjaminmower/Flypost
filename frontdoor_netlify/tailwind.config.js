/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html"],
  theme: {
    extend: {
      colors: {
        ink_black: '#060810',
        hot_berry: '#d82e7e',
        mint_leaf: '#40c9a2',
        bright_snow: '#f7f7f7',
        air_force_blue: {
          DEFAULT: '#628395',
          700: '#4a6270',
          800: '#3d505c',
          900: '#2f3e47',
        },
        lemon_lime: '#e0e03e'
      }
    }
  },
  plugins: []
}
