'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'

const companies = [
  {
    slug: 'limeapple-preppygoose',
    name: 'Limeapple + Preppy Goose',
    description: 'Kids & youth activewear and lifestyle apparel',
    logos: ['/logos/limeapple-logo-bk.png', '/logos/preppy-goose-logo-bk.png'],
  },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
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

export default function Home() {
  return (
    <div className="min-h-screen bg-[#FAFAF9] relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
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
              OrderHub
            </span>
          </div>
        </motion.header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center px-6 py-12 lg:px-16">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="w-full max-w-4xl"
          >
            {/* Hero Text */}
            <motion.div variants={itemVariants} className="mb-12 lg:mb-16 text-center">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-neutral-900 leading-[1.1]">
                Select Your Brand
              </h1>
              <p className="mt-4 text-lg text-neutral-500 max-w-xl mx-auto">
                Choose a brand to access wholesale ordering, inventory, and account management.
              </p>
            </motion.div>

            {/* Company Cards */}
            <div className="space-y-4">
              {companies.map((company) => (
                <motion.div key={company.slug} variants={itemVariants}>
                  <Link
                    href={`/${company.slug}`}
                    className="group relative flex items-center gap-6 p-8 lg:p-10 rounded-2xl bg-white border border-neutral-200/80 hover:border-neutral-300 hover:shadow-xl hover:shadow-neutral-200/50 transition-all duration-300"
                  >
                    {/* Logos */}
                    <div className="flex items-center gap-4 shrink-0">
                      {company.logos.map((logo, i) => (
                        <div key={i} className="relative w-16 h-16 lg:w-20 lg:h-20">
                          <Image
                            src={logo}
                            alt=""
                            fill
                            className="object-contain"
                          />
                        </div>
                      ))}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl lg:text-2xl font-semibold tracking-tight text-neutral-900 group-hover:text-neutral-700 transition-colors">
                        {company.name}
                      </h2>
                      <p className="mt-1 text-sm lg:text-base text-neutral-500">
                        {company.description}
                      </p>
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-neutral-100 group-hover:bg-neutral-200 transition-all duration-300 group-hover:translate-x-1">
                      <ArrowRight className="w-5 h-5 text-neutral-600" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Footer Note */}
            <motion.p
              variants={itemVariants}
              className="mt-12 text-center text-sm text-neutral-400"
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
