'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import theme from '@/lib/theme';

export default function NewProductPage() {
  const router = useRouter();
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [productType, setProductType] = useState('');
  const [hasOptions, setHasOptions] = useState<boolean | null>(null);
  const [showProductType, setShowProductType] = useState(true);

  return (
    <main style={{ padding: theme.spacing[10], maxWidth: theme.layout.maxContentWidth, margin: '0 auto' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing[10] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[3] }}>
            <button
              onClick={() => router.push('/seller/products')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: theme.typography.fontSize.xl, padding: 0, color: theme.colors.text.primary }}
            >
              ←
            </button>
            <span
              onClick={() => router.push('/seller/products')}
              style={{ fontSize: theme.typography.fontSize.base, color: theme.colors.text.tertiary, cursor: 'pointer' }}
            >
              Products
            </span>
          </div>
          <h2 style={{ fontSize: theme.typography.fontSize['5xl'], fontWeight: 'bold', margin: 0, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            New product
          </h2>
          <div style={{ display: 'flex', gap: theme.spacing[4] }}>
            <button
              style={{
                background: 'none',
                border: 'none',
                fontSize: theme.typography.fontSize.base,
                color: theme.colors.text.tertiary,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Save as draft
            </button>
            <button
              style={{
                backgroundColor: theme.colors.brand.primary,
                color: theme.colors.text.white,
                border: 'none',
                padding: `${theme.spacing[3]} ${theme.spacing[6]}`,
                borderRadius: theme.borderRadius.sm,
                fontSize: theme.typography.fontSize.base,
                cursor: 'pointer',
                fontWeight: theme.typography.fontWeight.medium,
              }}
            >
              Publish product
            </button>
          </div>
        </div>

        {/* Basic Information Section */}
        <section style={{ marginBottom: theme.spacing[10], paddingBottom: theme.spacing[10], borderBottom: `1px solid ${theme.colors.border.primary}` }}>
          <h3 style={{ fontSize: theme.typography.fontSize['3xl'], fontWeight: theme.typography.fontWeight.semibold, marginBottom: theme.spacing[2] }}>
            Basic information
          </h3>
          <p style={{ fontSize: theme.typography.fontSize.base, color: theme.colors.text.tertiary, marginBottom: theme.spacing[6] }}>
            Build buyer confidence with a clear, detailed product listing.
          </p>

          <div style={{ marginBottom: theme.spacing[6] }}>
            <label style={{ display: 'block', fontSize: theme.typography.fontSize.base, fontWeight: theme.typography.fontWeight.medium, marginBottom: theme.spacing[2] }}>
              Name
            </label>
            <input
              type="text"
              placeholder="Make your name concise and searchable"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              maxLength={60}
              style={{
                width: '100%',
                padding: theme.spacing[3],
                border: `1px solid ${theme.colors.border.tertiary}`,
                borderRadius: theme.borderRadius.sm,
                fontSize: theme.typography.fontSize.base,
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: theme.typography.fontFamily.body,
              }}
            />
            <div style={{ textAlign: 'right', fontSize: theme.typography.fontSize.sm, color: theme.colors.text.quaternary, marginTop: theme.spacing[1] }}>
              {productName.length}/60
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: theme.typography.fontSize.base, fontWeight: theme.typography.fontWeight.medium, marginBottom: theme.spacing[2] }}>
              Description
            </label>
            <textarea
              placeholder="Tell buyers the materials and details that make this product stand out"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={3000}
              style={{
                width: '100%',
                padding: theme.spacing[3],
                border: `1px solid ${theme.colors.border.tertiary}`,
                borderRadius: theme.borderRadius.sm,
                fontSize: theme.typography.fontSize.base,
                outline: 'none',
                minHeight: '120px',
                resize: 'vertical',
                fontFamily: theme.typography.fontFamily.body,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ textAlign: 'right', fontSize: theme.typography.fontSize.sm, color: theme.colors.text.quaternary, marginTop: theme.spacing[1] }}>
              {description.length}/3000
            </div>
          </div>
        </section>

        {/* Images Section */}
        <section style={{ marginBottom: theme.spacing[10], paddingBottom: theme.spacing[10], borderBottom: `1px solid ${theme.colors.border.primary}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing[2] }}>
            <h3 style={{ fontSize: theme.typography.fontSize['3xl'], fontWeight: theme.typography.fontWeight.semibold, margin: 0 }}>Images</h3>
            <button style={{ background: 'none', border: 'none', fontSize: theme.typography.fontSize.base, color: theme.colors.text.tertiary, cursor: 'pointer', textDecoration: 'underline' }}>
              Edit images
            </button>
          </div>
          <p style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary, marginBottom: theme.spacing[6] }}>
            Ensure your images have a neutral background, are cropped to fill the square, and include all product options. Images must be at least 600 x 600 pixels.{' '}
            <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Review guidelines</span>
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: theme.spacing[4] }}>
            {/* Featured Image */}
            <div
              style={{
                gridColumn: 'span 2',
                border: `2px dashed ${theme.colors.border.tertiary}`,
                borderRadius: theme.borderRadius.sm,
                padding: theme.spacing[10],
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                minHeight: '280px',
                backgroundColor: theme.colors.background.primary,
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: theme.borderRadius.full,
                  border: `2px solid ${theme.colors.text.tertiary}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: theme.spacing[4],
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.colors.text.tertiary} strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </div>
              <div style={{ fontSize: theme.typography.fontSize.base, fontWeight: theme.typography.fontWeight.medium, marginBottom: theme.spacing[1], textAlign: 'center' }}>
                Upload featured image
              </div>
              <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.quaternary, textAlign: 'center', marginBottom: theme.spacing[1] }}>
                Supported files .png, .jpg, .webp
              </div>
              <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.quaternary, textAlign: 'center' }}>Minimum 600 x 600 pixels</div>
            </div>

            {/* Additional Image Slots */}
            {[1, 2, 3, 4, 5, 6, 7, 8].map((slot) => (
              <div
                key={slot}
                style={{
                  border: `1px solid ${theme.colors.border.secondary}`,
                  borderRadius: theme.borderRadius.sm,
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.background.tertiary,
                  cursor: 'pointer',
                }}
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={theme.colors.border.tertiary} strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
              </div>
            ))}
          </div>
        </section>

        {/* Videos Section */}
        <section style={{ marginBottom: theme.spacing[10], paddingBottom: theme.spacing[10], borderBottom: `1px solid ${theme.colors.border.primary}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing[2] }}>
            <h3 style={{ fontSize: theme.typography.fontSize['3xl'], fontWeight: theme.typography.fontWeight.semibold, margin: 0 }}>Videos</h3>
            <button style={{ background: 'none', border: 'none', fontSize: theme.typography.fontSize.base, color: theme.colors.text.tertiary, cursor: 'pointer', textDecoration: 'underline' }}>
              Manage videos
            </button>
          </div>
          <p style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary, marginBottom: theme.spacing[6] }}>
            Add up to 3 videos to show your product in motion. Files must be 2 GB or under
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: theme.spacing[4] }}>
            {/* First Video Slot - Larger */}
            <div
              style={{
                border: `2px dashed ${theme.colors.border.tertiary}`,
                borderRadius: theme.borderRadius.sm,
                padding: `${theme.spacing[10]} ${theme.spacing[5]}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                minHeight: '200px',
                backgroundColor: theme.colors.background.primary,
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: theme.borderRadius.full,
                  border: `2px solid ${theme.colors.text.tertiary}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: theme.spacing[3],
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.colors.text.tertiary} strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </div>
              <div style={{ fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.medium, textAlign: 'center', marginBottom: theme.spacing[1] }}>
                Upload videos
              </div>
              <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.quaternary, textAlign: 'center' }}>Supported files .mov, .mp4</div>
            </div>

            {/* Additional Video Slots */}
            {[1, 2].map((slot) => (
              <div
                key={slot}
                style={{
                  border: `1px solid ${theme.colors.border.secondary}`,
                  borderRadius: theme.borderRadius.sm,
                  minHeight: '200px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.background.tertiary,
                  cursor: 'pointer',
                }}
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={theme.colors.border.tertiary} strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </div>
            ))}
          </div>
        </section>

        {/* Product Type Section */}
        <section style={{ marginBottom: theme.spacing[10], paddingBottom: theme.spacing[10], borderBottom: `1px solid ${theme.colors.border.primary}` }}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing[2], cursor: 'pointer' }}
            onClick={() => setShowProductType(!showProductType)}
          >
            <h3 style={{ fontSize: theme.typography.fontSize['3xl'], fontWeight: theme.typography.fontWeight.semibold, margin: 0 }}>Product type*</h3>
            <button style={{ background: 'none', border: 'none', fontSize: theme.typography.fontSize.xl, cursor: 'pointer', color: theme.colors.text.tertiary }}>
              {showProductType ? '∧' : '∨'}
            </button>
          </div>

          {showProductType && (
            <>
              <p style={{ fontSize: theme.typography.fontSize.base, color: theme.colors.text.tertiary, marginBottom: theme.spacing[6] }}>
                Choose a product type that best categorizes this product
              </p>

              <div>
                <label style={{ display: 'block', fontSize: theme.typography.fontSize.base, fontWeight: theme.typography.fontWeight.medium, marginBottom: theme.spacing[2] }}>
                  Product type
                </label>
                <div style={{ position: 'relative' }}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={theme.colors.text.tertiary}
                    strokeWidth="2"
                    style={{ position: 'absolute', left: theme.spacing[3], top: '50%', transform: 'translateY(-50%)' }}
                  >
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                  </svg>
                  <input
                    type="text"
                    placeholder="Example: Skirt, Baking Mix, Dog Collar"
                    value={productType}
                    onChange={(e) => setProductType(e.target.value)}
                    style={{
                      width: '100%',
                      padding: `${theme.spacing[3]} ${theme.spacing[3]} ${theme.spacing[3]} ${theme.spacing[10]}`,
                      border: `1px solid ${theme.colors.border.tertiary}`,
                      borderRadius: theme.borderRadius.sm,
                      fontSize: theme.typography.fontSize.base,
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: theme.typography.fontFamily.body,
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </section>

        {/* Product Options Section */}
        <section style={{ marginBottom: theme.spacing[10] }}>
          <h3 style={{ fontSize: theme.typography.fontSize['3xl'], fontWeight: theme.typography.fontWeight.semibold, marginBottom: theme.spacing[2] }}>Product options*</h3>
          <p style={{ fontSize: theme.typography.fontSize.base, color: theme.colors.text.tertiary, marginBottom: theme.spacing[6] }}>
            Manage any variations of this product—like sizes, colors, or the language of your packaging.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[4] }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[3], cursor: 'pointer' }}>
              <input
                type="radio"
                name="productOptions"
                checked={hasOptions === true}
                onChange={() => setHasOptions(true)}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: theme.typography.fontSize.base }}>This product has options</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[3], cursor: 'pointer' }}>
              <input
                type="radio"
                name="productOptions"
                checked={hasOptions === false}
                onChange={() => setHasOptions(false)}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: theme.typography.fontSize.base }}>{"This product doesn't have options"}</span>
            </label>
          </div>
        </section>
    </main>
  );
}
