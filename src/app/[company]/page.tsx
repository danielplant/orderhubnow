'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, ShoppingBag, Users, Settings } from 'lucide-react'
import { notFound } from 'next/navigation'

const companies: Record<string, {
  name: string
  logos: string[]
  description: string
}> = {
  'limeapple-preppygoose': {
    name: 'Limeapple + Preppy Goose',
    logos: ['/logos/limeapple-logo-bk.png', '/logos/preppy-goose-logo-bk.png'],
    description: 'Kids & youth activewear and lifestyle apparel',
  },
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.15,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  },
}

export default function CompanyPortalPage() {
  const params = useParams()
  const companySlug = params.company as string
  const company = companies[companySlug]

  if (!company) {
    notFound()
  }

  const portals = [
    {
      title: 'Place an Order',
      description: 'Browse catalog and place wholesale orders. For buyers and sales reps.',
      href: '/buyer/select-journey',
      icon: ShoppingBag,
      variant: 'primary' as const,
    },
    {
      title: 'Sales Rep Dashboard',
      description: 'View your accounts, track orders, and manage commissions.',
      href: '/rep',
      icon: Users,
      variant: 'secondary' as const,
    },
  ]

  return (
    <div className="min-h-screen bg-[#FAFAF9] relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.3 }}
          className="absolute top-20 right-[10%] w-64 h-64 rounded-full bg-gradient-to-br from-pink-100/40 to-transparent blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.5 }}
          className="absolute bottom-20 left-[15%] w-96 h-96 rounded-full bg-gradient-to-tl from-emerald-100/30 to-transparent blur-3xl"
        />
      </div>

      <div className="relative min-h-screen flex flex-col">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="pt-8 px-8 lg:pt-10 lg:px-16"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to brands
          </Link>
        </motion.header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center px-6 py-8 lg:px-16">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="w-full max-w-2xl"
          >
            {/* Brand Header */}
            <motion.div variants={itemVariants} className="mb-10 text-center">
              <div className="flex items-center justify-center gap-4 mb-4">
                {company.logos.map((logo, i) => (
                  <div key={i} className="relative w-14 h-14 lg:w-16 lg:h-16">
                    <Image src={logo} alt="" fill className="object-contain" />
                  </div>
                ))}
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-neutral-900">
                {company.name}
              </h1>
              <p className="mt-2 text-neutral-500">
                How would you like to proceed?
              </p>
            </motion.div>

            {/* Portal Cards */}
            <div className="space-y-4">
              {portals.map((portal) => (
                <motion.div key={portal.title} variants={itemVariants}>
                  <Link
                    href={portal.href}
                    className={`
                      group relative flex items-center gap-5 p-6 lg:p-7 rounded-2xl transition-all duration-300
                      ${portal.variant === 'primary'
                        ? 'bg-neutral-900 text-white hover:bg-neutral-800'
                        : 'bg-white text-neutral-900 border border-neutral-200/80 hover:border-neutral-300 hover:shadow-lg hover:shadow-neutral-200/50'
                      }
                    `}
                  >
                    <div className={`
                      flex items-center justify-center w-12 h-12 rounded-xl shrink-0
                      ${portal.variant === 'primary' ? 'bg-white/10' : 'bg-neutral-100'}
                    `}>
                      <portal.icon className={`w-5 h-5 ${portal.variant === 'primary' ? 'text-white' : 'text-neutral-700'}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-semibold tracking-tight">
                        {portal.title}
                      </h2>
                      <p className={`mt-1 text-sm ${portal.variant === 'primary' ? 'text-white/70' : 'text-neutral-500'}`}>
                        {portal.description}
                      </p>
                    </div>

                    <div className={`
                      flex items-center justify-center w-9 h-9 rounded-full transition-all duration-300 group-hover:translate-x-1
                      ${portal.variant === 'primary' ? 'bg-white/10' : 'bg-neutral-100 group-hover:bg-neutral-200'}
                    `}>
                      <ArrowRight className={`w-4 h-4 ${portal.variant === 'primary' ? 'text-white' : 'text-neutral-600'}`} />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Admin Link - Subtle */}
            <motion.div variants={itemVariants} className="mt-8 pt-6 border-t border-neutral-200">
              <Link
                href="/admin"
                className="flex items-center justify-center gap-2 text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <Settings className="w-4 h-4" />
                Admin Access
              </Link>
            </motion.div>
          </motion.div>
        </main>

        {/* Bottom decorative line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
          className="h-1 bg-gradient-to-r from-pink-400 via-neutral-900 to-emerald-500 origin-left"
        />
      </div>
    </div>
  )
}
