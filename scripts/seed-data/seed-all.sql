-- Combined seed data (exported from production 2026-01-08)
-- Run with: node scripts/seed-data/run-seed.js

-- ============================================================================
-- 0. Clear dependent tables first (FK order)
-- ============================================================================
DELETE FROM [dbo].[Sku]
GO
DELETE FROM [dbo].[SkuMainSubRship]
GO
DELETE FROM [dbo].[Users]
GO

-- ============================================================================
-- 1. SkuCategories
-- ============================================================================
DELETE FROM [dbo].[SkuCategories]
GO
SET IDENTITY_INSERT [dbo].[SkuCategories] ON
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (157, N'Cozy', 0, NULL, NULL, N'ATS, Wholesale, osc-ignore', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (187, N'Active', 0, NULL, NULL, N'ATS, Wholesale, osc-ignore', NULL, 1)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (330, N'Swim', 0, NULL, NULL, N'ATS, Wholesale, osc-ignore', NULL, 1)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (358, N'Almost Gone - Last Call', 0, NULL, NULL, N'ATS, Wholesale, osc-ignore', NULL, 1)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (395, N'SS23 SWIM', 0, NULL, NULL, N'ATS, Wholesale, osc-ignore', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (396, N'SS24 SWIM', 1, NULL, NULL, N'Pre Order, Wholesale, osc-ignore', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (397, N'Bubble', 1, NULL, NULL, N'Pre Order, Wholesale, osc-ignore', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (398, N'Active SS24', 1, NULL, NULL, N'Pre Order, Wholesale, osc-ignore', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (399, N'HOLIDAY24 PREPPY GOOSE (SEP 15TH TO OCT 15TH)', 1, NULL, NULL, N'Pre Order, Wholesale, osc-ignore', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (400, N'Preppy Goose Delivery 1', 0, NULL, NULL, N'ATS, Wholesale, osc-ignore', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (401, N'FALL24 PREPPY GOOSE (JUL 1ST TO JUL 31ST)', 1, NULL, NULL, N'Pre Order, Wholesale, osc-ignore', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (402, N'SS24 SWIM', 0, NULL, NULL, N'ATS, Wholesale, osc-ignore', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (403, N'SS25 SWIM', 1, NULL, NULL, N'Pre Order, Wholesale, osc-ignore', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (407, N'SS25 PREPPY GOOSE', 1, NULL, NULL, N'Pre Order, Wholesale, osc-ignore', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (409, N'FW24 COZY', 1, NULL, NULL, NULL, NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (410, N'Preppy Goose', 0, NULL, NULL, N'ATS, Wholesale, osc-ignore', 1, 1)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (411, N'FW25 Preppy Goose', 1, NULL, NULL, N'Pre Order, Wholesale, osc-ignore', NULL, 0)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (412, N'Holiday 2025 Preppy Goose', 1, NULL, NULL, N'Pre Order, Wholesale, osc-ignore', NULL, 0)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (413, N'SS25 Swim', 0, NULL, NULL, N'ATS, Wholesale, osc-ignore', NULL, 0)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (414, N'SS25 Preppy Goose', 0, NULL, NULL, N'ATS, Wholesale, osc-ignore', 3, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (415, N'SS26 Swim', 1, NULL, NULL, N'Pre Order, Wholesale, osc-ignore', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (416, N'SS26 Preppy Goose', 1, CAST(N'2026-01-01T00:00:00.000' AS DateTime), CAST(N'2026-01-30T00:00:00.000' AS DateTime), N'Pre Order, Wholesale, SS26', 1, 1)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (417, N'SS26 Swim I (Jan 1-20)', 1, CAST(N'2026-01-01T00:00:00.000' AS DateTime), CAST(N'2026-01-20T00:00:00.000' AS DateTime), N'Pre Order, Wholesale, osc-ignore', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (418, N'SS26 Swim II (Jan 20 - Feb 15)', 1, CAST(N'2026-01-20T00:00:00.000' AS DateTime), CAST(N'2026-02-15T00:00:00.000' AS DateTime), N'Pre Order, Wholesale, SS26', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (419, N'Resort 2026', 1, CAST(N'2025-11-01T00:00:00.000' AS DateTime), CAST(N'2025-11-30T00:00:00.000' AS DateTime), N'Pre Order, Wholesale, SS26', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (420, N'SS26 Swim I (Jan 1-20)', 1, CAST(N'2026-01-01T00:00:00.000' AS DateTime), CAST(N'2026-01-20T00:00:00.000' AS DateTime), N'Pre Order, Wholesale, osc-ignore', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (421, N'SS26 Swim I (Jan 1 - 20)', 1, NULL, NULL, N'Pre Order, Wholesale, SS26', NULL, 0)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (422, N'Holiday Preppy Goose', 0, NULL, NULL, N'ATS, Wholesale, osc-ignore', NULL, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (423, N'Holiday 2025 Preppy Goose', 0, NULL, NULL, N'ATS, Wholesale, osc-ignore', 2, 1)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (424, N'FW25 Preppy Goose', 0, NULL, NULL, N'ATS, Wholesale, osc-ignore', 4, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (425, N'Fuzzy Dolls 2025 Preppy Goose', 1, NULL, NULL, N'Pre Order, Wholesale, osc-ignore', 4, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (426, N'FW25 Preppy Goose PJs', 1, NULL, NULL, N'Pre Order, Wholesale, osc-ignore', 2, 1)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (427, N'Holiday 2025 Preppy Goose PJs', 1, NULL, NULL, N'Pre Order, Wholesale, osc-ignore', 3, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (428, N'Holiday 2025 Preppy Goose PJs', 1, NULL, NULL, N'Pre Order, Wholesale, osc-ignore', 3, NULL)
INSERT [dbo].[SkuCategories] ([ID], [Name], [IsPreOrder], [OnRouteAvailableDate], [OnRouteAvailableDateEnd], [ShopifyOrderTags], [SortOrder], [ShopifyImages]) VALUES (429, N'Preppy Goose Boys', 0, NULL, NULL, NULL, 5, 1)
SET IDENTITY_INSERT [dbo].[SkuCategories] OFF
GO

-- ============================================================================
-- 2. SkuMainCategory
-- ============================================================================
DELETE FROM [dbo].[SkuMainCategory]
GO
SET IDENTITY_INSERT [dbo].[SkuMainCategory] ON
INSERT [dbo].[SkuMainCategory] ([ID], [Name], [DisplayOrder]) VALUES (1, N'Cozy', 1)
INSERT [dbo].[SkuMainCategory] ([ID], [Name], [DisplayOrder]) VALUES (3, N'Active', 3)
INSERT [dbo].[SkuMainCategory] ([ID], [Name], [DisplayOrder]) VALUES (6, N'Swim', 4)
INSERT [dbo].[SkuMainCategory] ([ID], [Name], [DisplayOrder]) VALUES (8, N'Almost Gone / Last Call', 10)
INSERT [dbo].[SkuMainCategory] ([ID], [Name], [DisplayOrder]) VALUES (13, N'Swim (Pre-order)', 1)
INSERT [dbo].[SkuMainCategory] ([ID], [Name], [DisplayOrder]) VALUES (16, N'PREPPY GOOSE (Pre-order)', 999)
INSERT [dbo].[SkuMainCategory] ([ID], [Name], [DisplayOrder]) VALUES (25, N'Cozy P (Pre-order)', 999)
INSERT [dbo].[SkuMainCategory] ([ID], [Name], [DisplayOrder]) VALUES (26, N'Preppy Goose', 999)
INSERT [dbo].[SkuMainCategory] ([ID], [Name], [DisplayOrder]) VALUES (27, N'P8610', 999)
SET IDENTITY_INSERT [dbo].[SkuMainCategory] OFF
GO

-- ============================================================================
-- 3. SkuMainSubRship
-- ============================================================================
DELETE FROM [dbo].[SkuMainSubRship]
GO
SET IDENTITY_INSERT [dbo].[SkuMainSubRship] ON
INSERT [dbo].[SkuMainSubRship] ([ID], [SkuMainCatID], [SkuSubCatID]) VALUES (261, 6, 330)
INSERT [dbo].[SkuMainSubRship] ([ID], [SkuMainCatID], [SkuSubCatID]) VALUES (301, 1, 157)
INSERT [dbo].[SkuMainSubRship] ([ID], [SkuMainCatID], [SkuSubCatID]) VALUES (302, 3, 187)
INSERT [dbo].[SkuMainSubRship] ([ID], [SkuMainCatID], [SkuSubCatID]) VALUES (316, 8, 358)
INSERT [dbo].[SkuMainSubRship] ([ID], [SkuMainCatID], [SkuSubCatID]) VALUES (383, 26, 410)
INSERT [dbo].[SkuMainSubRship] ([ID], [SkuMainCatID], [SkuSubCatID]) VALUES (387, 26, 414)
INSERT [dbo].[SkuMainSubRship] ([ID], [SkuMainCatID], [SkuSubCatID]) VALUES (389, 16, 416)
INSERT [dbo].[SkuMainSubRship] ([ID], [SkuMainCatID], [SkuSubCatID]) VALUES (391, 13, 418)
INSERT [dbo].[SkuMainSubRship] ([ID], [SkuMainCatID], [SkuSubCatID]) VALUES (392, 13, 419)
INSERT [dbo].[SkuMainSubRship] ([ID], [SkuMainCatID], [SkuSubCatID]) VALUES (394, 13, 421)
INSERT [dbo].[SkuMainSubRship] ([ID], [SkuMainCatID], [SkuSubCatID]) VALUES (396, 26, 423)
INSERT [dbo].[SkuMainSubRship] ([ID], [SkuMainCatID], [SkuSubCatID]) VALUES (397, 26, 424)
INSERT [dbo].[SkuMainSubRship] ([ID], [SkuMainCatID], [SkuSubCatID]) VALUES (402, 26, 429)
SET IDENTITY_INSERT [dbo].[SkuMainSubRship] OFF
GO

-- ============================================================================
-- 4. Reps
-- ============================================================================
DELETE FROM [dbo].[Reps]
GO
SET IDENTITY_INSERT [dbo].[Reps] ON
INSERT [dbo].[Reps] ([ID], [Name], [Code], [Address], [Phone], [Fax], [Cell], [Email1], [Email2], [Email3], [Country]) VALUES (2, N'Betty Jacobs', N'BJ', N'4135 67th Street NW Calgary, AB T3B2J2', N'403-237-5857', N'403-819-1451', N'403-286-2387', N'betty@bettyjacobs.com', N'', N'', N'Canada')
INSERT [dbo].[Reps] ([ID], [Name], [Code], [Address], [Phone], [Fax], [Cell], [Email1], [Email2], [Email3], [Country]) VALUES (4, N'Dell Gallant', N'DG', N'9124 Boul. St-Laurent Montreal, Quebec H2N 1M9', N'', N'514 388 0712', N'514-916-1780', N'delgallant@hotmail.com', N'jmiquelon@viceotron.ca', N'', N'Canada')
INSERT [dbo].[Reps] ([ID], [Name], [Code], [Address], [Phone], [Fax], [Cell], [Email1], [Email2], [Email3], [Country]) VALUES (6, N'Pam Story Sales Agency', N'PS', N'2770 Dufferin Street, Suite 205, P.O. Box 205, Toronto, ON M6B 3R7', N'416-504-8599', N'416-504-6780', N'', N'pssales@on.aibn.com', N'', N'', N'Canada')
INSERT [dbo].[Reps] ([ID], [Name], [Code], [Address], [Phone], [Fax], [Cell], [Email1], [Email2], [Email3], [Country]) VALUES (7, N'Joanne Farese', N'JF', N'1032 Irving St. #972 San Francisco, CA 94122', N'415-742-5422', N'415-661-2296', N'415-699-2968', N'j_farese@sbcglobal.net', N'', N'', N'USA')
INSERT [dbo].[Reps] ([ID], [Name], [Code], [Address], [Phone], [Fax], [Cell], [Email1], [Email2], [Email3], [Country]) VALUES (8, N'Kathy Fedoryshyn', N'KF', N'4455 Shagbark Lane Brookfield, WI 53005', N'262-781-8685', N'262-781-7165', N'414-350-4594', N'kathyfed@yahoo.com', N'', N'', N'USA')
INSERT [dbo].[Reps] ([ID], [Name], [Code], [Address], [Phone], [Fax], [Cell], [Email1], [Email2], [Email3], [Country]) VALUES (9, N'Marji Memmo', N'MM', N'61 Broad Reach Unit T71 North Weymouth, Ma. 02191', N'617-818-1797', N'781-407-0670', N'781-461-8851', N'Marjimem2@comcast.net', N'', N'', N'USA')
INSERT [dbo].[Reps] ([ID], [Name], [Code], [Address], [Phone], [Fax], [Cell], [Email1], [Email2], [Email3], [Country]) VALUES (12, N'Honey Smith - A Bit of Honey', N'HS', N'34 W. 33rd Street Suite 1212, New York, NY 10001', N'(212) 947 - 5644', N'(212) 268 - 5848', N'', N'busybee@abitofhoney.com', N'Honey@Abitofhoney.com', N'', N'USA')
INSERT [dbo].[Reps] ([ID], [Name], [Code], [Address], [Phone], [Fax], [Cell], [Email1], [Email2], [Email3], [Country]) VALUES (15, N'No Rep', N'TBD', N'', N'', N'', N'', N'nrha', N'', N'', N'')
INSERT [dbo].[Reps] ([ID], [Name], [Code], [Address], [Phone], [Fax], [Cell], [Email1], [Email2], [Email3], [Country]) VALUES (16, N'Halley Singer', N'HAL', N'2050 Stemmons Freeway, WTC 8868, Dallas, Texas 75207', N'214-638-3058', N'', N'214-769-2457', N'halleysinger@sbcglobal.net', N'', N'', N'USA')
INSERT [dbo].[Reps] ([ID], [Name], [Code], [Address], [Phone], [Fax], [Cell], [Email1], [Email2], [Email3], [Country]) VALUES (19, N'Harvey Mazin', N'HM', N'', N'', N'', N'', N'harv0203@aol.com', N'', N'', N'USA')
INSERT [dbo].[Reps] ([ID], [Name], [Code], [Address], [Phone], [Fax], [Cell], [Email1], [Email2], [Email3], [Country]) VALUES (20, N'Toni Hartman', N'TH', N'', N'808-372-0432', N'', N'', N'hartmant001@hawaii.rr.com', N'', N'', N'USA')
INSERT [dbo].[Reps] ([ID], [Name], [Code], [Address], [Phone], [Fax], [Cell], [Email1], [Email2], [Email3], [Country]) VALUES (21, N'Joanne Torres', N'JT', N'', N'213-623-0993', N'213-244-9645', N'', N'josrags@aol.com', N'', N'', N'USA')
INSERT [dbo].[Reps] ([ID], [Name], [Code], [Address], [Phone], [Fax], [Cell], [Email1], [Email2], [Email3], [Country]) VALUES (22, N'L & R Showroom', N'LR', N'', N'', N'', N'', N'info@landrshowroom.com', N'', N'', N'USA')
SET IDENTITY_INSERT [dbo].[Reps] OFF
GO

-- ============================================================================
-- 5. Users
-- ============================================================================
DELETE FROM [dbo].[Users]
GO
SET IDENTITY_INSERT [dbo].[Users] ON
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (1, N'LimeAdmin', N'Green2022###!', N'Admin', NULL)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (3, N'admin', N'Green2022###!', N'Admin', NULL)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (5, N'betty@bettyjacobs.com', N'betty1', N'Rep', 2)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (7, N'delgallant@hotmail.com', N'gallant2', N'Rep', 4)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (8, N'd.delrio@telus.net_removed20210506', N'', N'Rep', NULL)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (9, N'pssales@on.aibn.com', N'pam4', N'Rep', 6)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (10, N'j_farese@sbcglobal.net', N'joanne5', N'Rep', 7)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (11, N'kathyfed@yahoo.com', N'kathy6', N'Rep', 8)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (12, N'Marjimem2@comcast.net', N'marji7', N'Rep', 9)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (14, N'Emily@thekleingrouponline.com', N'klien9', N'Rep', NULL)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (15, N'busybee@abitofhoney.com', N'honey10', N'Rep', 12)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (18, N'nrha', N'houseaccount5', N'Rep', 15)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (19, N'halleysinger@sbcglobal.net', N'halleysinger16', N'Rep', 16)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (22, N'harv0203@aol.com', N'harvey02', N'Rep', 19)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (23, N'hartmant001@hawaii.rr.com', N'hartm@n20', N'Rep', 20)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (24, N'josrags@aol.com', N'torr3s21', N'Rep', 21)
INSERT [dbo].[Users] ([ID], [LoginID], [Password], [UserType], [RepId]) VALUES (25, N'info@landrshowroom.com', N'l3rsh00', N'Rep', 22)
SET IDENTITY_INSERT [dbo].[Users] OFF
GO
