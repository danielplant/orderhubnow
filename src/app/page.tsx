'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Building2, Users, ShoppingBag, UserCheck, ArrowRight, Sparkles } from 'lucide-react'

const portals = [
  {
    title: 'Admin Portal',
    description: 'Manage inventory, orders, and business analytics',
    href: '/admin',
    icon: Building2,
    variant: 'primary' as const,
  },
  {
    title: 'Sales Rep Portal',
    description: 'Access accounts, create orders, track commissions',
    href: '/rep',
    icon: Users,
    variant: 'secondary' as const,
  },
  {
    title: 'Shop as Customer',
    description: 'Browse catalog and place wholesale orders',
    href: '/buyer/select-journey',
    icon: ShoppingBag,
    variant: 'accent' as const,
  },
  {
    title: 'Rep: Order for Customer',
    description: 'Submit orders on behalf of your accounts',
    href: '/rep/login?callbackUrl=/rep/new-order',
    icon: UserCheck,
    variant: 'secondary' as const,
  },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.2,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 32, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  },
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[#FAFAF9] relative overflow-hidden">
      {/* Geometric Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Large diagonal lines */}
        <svg
          className="absolute -top-1/4 -right-1/4 w-[150%] h-[150%] opacity-[0.03]"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <pattern id="diagonals" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="20" stroke="currentColor" strokeWidth="0.5" className="text-neutral-900" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#diagonals)" />
        </svg>

        {/* Floating geometric shapes */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.5 }}
          className="absolute top-20 left-[10%] w-64 h-64 rounded-full bg-gradient-to-br from-emerald-100/40 to-transparent blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.7 }}
          className="absolute bottom-20 right-[15%] w-96 h-96 rounded-full bg-gradient-to-tl from-amber-100/30 to-transparent blur-3xl"
        />

        {/* Decorative corner accent */}
        <svg
          className="absolute top-0 right-0 w-[400px] h-[400px] text-neutral-900/[0.02]"
          viewBox="0 0 400 400"
        >
          <circle cx="400" cy="0" r="300" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="400" cy="0" r="200" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="400" cy="0" r="100" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>

      <div className="relative min-h-screen flex flex-col">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="pt-8 px-8 lg:pt-12 lg:px-16"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold tracking-tight text-neutral-900">
              MyOrderHub
            </span>
          </div>
        </motion.header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center px-6 py-12 lg:px-16">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="w-full max-w-5xl"
          >
            {/* Hero Text */}
            <motion.div variants={itemVariants} className="mb-12 lg:mb-16">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-neutral-900 leading-[1.1]">
                Wholesale ordering,{' '}
                <span className="relative">
                  <span className="relative z-10">simplified</span>
                  <motion.span
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.8, delay: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="absolute -bottom-1 left-0 right-0 h-3 bg-emerald-200/60 -z-0 origin-left"
                  />
                </span>
              </h1>
              <p className="mt-4 text-lg text-neutral-500 max-w-xl">
                Select your portal to access the platform. Admin and Rep portals require authentication.
              </p>
            </motion.div>

            {/* Portal Cards Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:gap-5">
              {portals.map((portal, index) => (
                <motion.div
                  key={portal.title}
                  variants={cardVariants}
                  custom={index}
                >
                  <Link
                    href={portal.href}
                    className={`
                      group relative flex flex-col p-6 lg:p-7 rounded-2xl
                      transition-all duration-300 ease-out
                      ${portal.variant === 'primary'
                        ? 'bg-neutral-900 text-white hover:bg-neutral-800'
                        : portal.variant === 'accent'
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                        : 'bg-white text-neutral-900 border border-neutral-200/80 hover:border-neutral-300 hover:shadow-lg hover:shadow-neutral-200/50'
                      }
                    `}
                  >
                    {/* Card Content */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className={`
                          inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4
                          ${portal.variant === 'primary'
                            ? 'bg-white/10'
                            : portal.variant === 'accent'
                            ? 'bg-white/20'
                            : 'bg-neutral-100'
                          }
                        `}>
                          <portal.icon className={`
                            w-5 h-5
                            ${portal.variant === 'primary' || portal.variant === 'accent'
                              ? 'text-white'
                              : 'text-neutral-700'
                            }
                          `} />
                        </div>
                        <h2 className="text-lg font-semibold tracking-tight">
                          {portal.title}
                        </h2>
                        <p className={`
                          mt-1.5 text-sm leading-relaxed
                          ${portal.variant === 'primary' || portal.variant === 'accent'
                            ? 'text-white/70'
                            : 'text-neutral-500'
                          }
                        `}>
                          {portal.description}
                        </p>
                      </div>
                      <div className={`
                        flex items-center justify-center w-9 h-9 rounded-full
                        transition-transform duration-300 group-hover:translate-x-1
                        ${portal.variant === 'primary'
                          ? 'bg-white/10'
                          : portal.variant === 'accent'
                          ? 'bg-white/20'
                          : 'bg-neutral-100 group-hover:bg-neutral-200'
                        }
                      `}>
                        <ArrowRight className={`
                          w-4 h-4
                          ${portal.variant === 'primary' || portal.variant === 'accent'
                            ? 'text-white'
                            : 'text-neutral-600'
                          }
                        `} />
                      </div>
                    </div>

                    {/* Subtle shine effect on hover */}
                    <div className={`
                      absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100
                      transition-opacity duration-500 pointer-events-none overflow-hidden
                    `}>
                      <div className={`
                        absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%]
                        transition-transform duration-1000 ease-out
                        bg-gradient-to-r from-transparent via-white/10 to-transparent
                      `} />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Footer Note */}
            <motion.p
              variants={itemVariants}
              className="mt-8 text-center text-sm text-neutral-400"
            >
              Secure wholesale platform for authorized retailers
            </motion.p>
          </motion.div>
        </main>

        {/* Bottom decorative line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.2, delay: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="h-1 bg-gradient-to-r from-emerald-500 via-neutral-900 to-amber-500 origin-left"
        />
      </div>
    </div>
  )
}
