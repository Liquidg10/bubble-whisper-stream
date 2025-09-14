import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			colors: {
				/* Core design system colors */
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				
				/* Bubble Universe semantic colors */
				'universe-bg': 'hsl(var(--bg-universe))',
				'text-primary': 'hsl(var(--text-primary))',
				'text-secondary': 'hsl(var(--text-secondary))',
				
				/* Iridescent accent trilogy */
				'accent-void': 'hsl(var(--accent-void))',
				'accent-flow': 'hsl(var(--accent-flow))',
				'accent-growth': 'hsl(var(--accent-growth))',
				
				/* Emotional spectrum */
				'danger-soft': 'hsl(var(--danger-soft))',
				'success-gentle': 'hsl(var(--success-gentle))',
				'warning-glow': 'hsl(var(--warning-glow))',
				
				/* Bubble states */
				'bubble-idle': 'hsl(var(--bubble-idle))',
				'bubble-active': 'hsl(var(--bubble-active))',
				'bubble-selected': 'hsl(var(--bubble-selected))',
				'bubble-reminder': 'hsl(var(--bubble-reminder))',
				
				/* Matrix card states */
				'matrix-card-bg': 'hsl(var(--matrix-card-bg))',
				'matrix-card-border': 'hsl(var(--matrix-card-border))',
				
				/* Standard shadcn mappings */
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				}
			},
			backgroundImage: {
				'gradient-aurora': 'var(--gradient-aurora)',
				'gradient-canvas': 'var(--gradient-canvas)',
				'gradient-bubble': 'var(--gradient-bubble)',
				'gradient-gentle': 'var(--gradient-gentle)'
			},
			boxShadow: {
				'glow-soft': 'var(--glow-soft)',
				'glow-medium': 'var(--glow-medium)',
				'glow-strong': 'var(--glow-strong)',
				'depth': 'var(--shadow-depth)'
			},
			spacing: {
				'bubble': 'var(--space-bubble)',
				'breath': 'var(--space-breath)'
			},
			fontSize: {
				'whisper': 'var(--font-size-whisper)',
				'gentle': 'var(--font-size-gentle)',
				'natural': 'var(--font-size-natural)',
				'speak': 'var(--font-size-speak)',
				'call': 'var(--font-size-call)',
				'shout': 'var(--font-size-shout)'
			},
			transitionTimingFunction: {
				'gentle': 'cubic-bezier(0.4, 0, 0.2, 1)',
				'bubble': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
				'flow': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
			},
			transitionDuration: {
				'gentle': 'var(--transition-gentle)',
				'bubble': 'var(--transition-bubble)', 
				'flow': 'var(--transition-flow)'
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
