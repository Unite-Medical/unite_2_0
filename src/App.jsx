import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { ScrollToTop } from './components/layout/ScrollToTop.jsx';
import { PageLoader } from './components/layout/PageLoader.jsx';
import { Bootstrap } from './components/layout/Bootstrap.jsx';
import { RequireAdmin } from './components/layout/RequireAdmin.jsx';

const Homepage = lazy(() => import('./pages/Homepage.jsx').then((m) => ({ default: m.Homepage })));
const Catalog = lazy(() => import('./pages/Catalog.jsx').then((m) => ({ default: m.Catalog })));
const Quote = lazy(() => import('./pages/Quote.jsx').then((m) => ({ default: m.Quote })));
const QuoteNew = lazy(() => import('./pages/QuoteNew.jsx').then((m) => ({ default: m.QuoteNew })));
const QuotePrint = lazy(() => import('./pages/QuotePrint.jsx').then((m) => ({ default: m.QuotePrint })));
const QuoteAccept = lazy(() => import('./pages/QuoteAccept.jsx').then((m) => ({ default: m.QuoteAccept })));
const PortalQuote = lazy(() => import('./pages/PortalQuote.jsx').then((m) => ({ default: m.PortalQuote })));
const AccountQuotes = lazy(() => import('./pages/AccountQuotes.jsx').then((m) => ({ default: m.AccountQuotes })));
const AccountTeam = lazy(() => import('./pages/AccountTeam.jsx').then((m) => ({ default: m.AccountTeam })));
const RepPortal = lazy(() => import('./pages/RepPortal.jsx').then((m) => ({ default: m.RepPortal })));
const Surplus = lazy(() => import('./pages/Surplus.jsx').then((m) => ({ default: m.Surplus })));
const SurplusMarket = lazy(() => import('./pages/SurplusMarket.jsx').then((m) => ({ default: m.SurplusMarket })));
const ShortageMatch = lazy(() => import('./pages/ShortageMatch.jsx').then((m) => ({ default: m.ShortageMatch })));
const SupplyRisk = lazy(() => import('./pages/SupplyRisk.jsx').then((m) => ({ default: m.SupplyRisk })));
const ProductDetail = lazy(() => import('./pages/ProductDetail.jsx').then((m) => ({ default: m.ProductDetail })));
const Cart = lazy(() => import('./pages/Cart.jsx').then((m) => ({ default: m.Cart })));
const Checkout = lazy(() => import('./pages/Checkout.jsx').then((m) => ({ default: m.Checkout })));
const OrderSuccess = lazy(() => import('./pages/OrderSuccess.jsx').then((m) => ({ default: m.OrderSuccess })));
const TrackOrder = lazy(() => import('./pages/TrackOrder.jsx').then((m) => ({ default: m.TrackOrder })));
const About = lazy(() => import('./pages/About.jsx').then((m) => ({ default: m.About })));
const Contact = lazy(() => import('./pages/Contact.jsx').then((m) => ({ default: m.Contact })));
const Support = lazy(() => import('./pages/Support.jsx').then((m) => ({ default: m.Support })));
const Locations = lazy(() => import('./pages/Locations.jsx').then((m) => ({ default: m.Locations })));
const Blog = lazy(() => import('./pages/Blog.jsx').then((m) => ({ default: m.Blog })));
const BlogPost = lazy(() => import('./pages/BlogPost.jsx').then((m) => ({ default: m.BlogPost })));
const Resources = lazy(() => import('./pages/Resources.jsx').then((m) => ({ default: m.Resources })));
const Compliance = lazy(() => import('./pages/Compliance.jsx').then((m) => ({ default: m.Compliance })));
const Careers = lazy(() => import('./pages/Careers.jsx').then((m) => ({ default: m.Careers })));
const Portfolio = lazy(() => import('./pages/Portfolio.jsx').then((m) => ({ default: m.Portfolio })));
const Procurement = lazy(() => import('./pages/Procurement.jsx').then((m) => ({ default: m.Procurement })));
const CodingResources = lazy(() => import('./pages/CodingResources.jsx').then((m) => ({ default: m.CodingResources })));
const Privacy = lazy(() => import('./pages/legal/Legal.jsx').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('./pages/legal/Legal.jsx').then((m) => ({ default: m.Terms })));
const Returns = lazy(() => import('./pages/legal/Legal.jsx').then((m) => ({ default: m.Returns })));
const ShippingPage = lazy(() => import('./pages/legal/Legal.jsx').then((m) => ({ default: m.Shipping })));
const Services = lazy(() => import('./pages/Services.jsx').then((m) => ({ default: m.Services })));
const ServiceDistribution = lazy(() => import('./pages/ServiceDistribution.jsx').then((m) => ({ default: m.ServiceDistribution })));
const ServicePDAC = lazy(() => import('./pages/ServicePDAC.jsx').then((m) => ({ default: m.ServicePDAC })));
const ServiceDistributors = lazy(() => import('./pages/ServiceDistributors.jsx').then((m) => ({ default: m.ServiceDistributors })));
const ServicePrivateLabel = lazy(() => import('./pages/ServicePrivateLabel.jsx').then((m) => ({ default: m.ServicePrivateLabel })));
const Government = lazy(() => import('./pages/Government.jsx').then((m) => ({ default: m.Government })));
const CaseStudyTJS = lazy(() => import('./pages/CaseStudyTJS.jsx').then((m) => ({ default: m.CaseStudyTJS })));
const SegmentASC = lazy(() => import('./pages/segments/SegmentASC.jsx').then((m) => ({ default: m.SegmentASC })));
const SegmentPharmacy = lazy(() => import('./pages/segments/SegmentPharmacy.jsx').then((m) => ({ default: m.SegmentPharmacy })));
const SegmentEMS = lazy(() => import('./pages/segments/SegmentEMS.jsx').then((m) => ({ default: m.SegmentEMS })));
const SegmentDealers = lazy(() => import('./pages/segments/SegmentDealers.jsx').then((m) => ({ default: m.SegmentDealers })));
const Login = lazy(() => import('./pages/Login.jsx').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Register.jsx').then((m) => ({ default: m.Register })));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx').then((m) => ({ default: m.Dashboard })));
const AccountSettings = lazy(() => import('./pages/AccountSettings.jsx').then((m) => ({ default: m.AccountSettings })));
const Invoices = lazy(() => import('./pages/Invoices.jsx').then((m) => ({ default: m.Invoices })));
const InvoicePrint = lazy(() => import('./pages/InvoicePrint.jsx').then((m) => ({ default: m.InvoicePrint })));
const PurchaseOrderPrint = lazy(() => import('./pages/admin/PurchaseOrderPrint.jsx').then((m) => ({ default: m.PurchaseOrderPrint })));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview.jsx').then((m) => ({ default: m.AdminOverview })));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics.jsx').then((m) => ({ default: m.AdminAnalytics })));
const AdminInventory = lazy(() => import('./pages/admin/AdminInventory.jsx').then((m) => ({ default: m.AdminInventory })));
const AdminCRM = lazy(() => import('./pages/admin/AdminCRM.jsx').then((m) => ({ default: m.AdminCRM })));
const AdminReps = lazy(() => import('./pages/admin/AdminReps.jsx').then((m) => ({ default: m.AdminReps })));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders.jsx').then((m) => ({ default: m.AdminOrders })));
const AdminCMS = lazy(() => import('./pages/admin/AdminCMS.jsx').then((m) => ({ default: m.AdminCMS })));
const AdminVendorApproval = lazy(() => import('./pages/admin/AdminVendorApproval.jsx').then((m) => ({ default: m.AdminVendorApproval })));
const AdminQuotes = lazy(() => import('./pages/admin/AdminQuotes.jsx').then((m) => ({ default: m.AdminQuotes })));
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers.jsx').then((m) => ({ default: m.AdminCustomers })));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts.jsx').then((m) => ({ default: m.AdminProducts })));
const AdminProductEdit = lazy(() => import('./pages/admin/AdminProductEdit.jsx').then((m) => ({ default: m.AdminProductEdit })));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings.jsx').then((m) => ({ default: m.AdminSettings })));
const AdminIntegrations = lazy(() => import('./pages/admin/AdminIntegrations.jsx').then((m) => ({ default: m.AdminIntegrations })));
const AdminAI = lazy(() => import('./pages/admin/AdminAI.jsx').then((m) => ({ default: m.AdminAI })));
const AdminMarginPolicy = lazy(() => import('./pages/admin/AdminMarginPolicy.jsx').then((m) => ({ default: m.AdminMarginPolicy })));
const AdminSurplus = lazy(() => import('./pages/admin/AdminSurplus.jsx').then((m) => ({ default: m.AdminSurplus })));
const AdminProductOnboard = lazy(() => import('./pages/admin/AdminProductOnboard.jsx').then((m) => ({ default: m.AdminProductOnboard })));
const AdminReplenishment = lazy(() => import('./pages/admin/AdminReplenishment.jsx').then((m) => ({ default: m.AdminReplenishment })));
const AdminDigest = lazy(() => import('./pages/admin/AdminDigest.jsx').then((m) => ({ default: m.AdminDigest })));
const AdminFinance = lazy(() => import('./pages/admin/AdminFinance.jsx').then((m) => ({ default: m.AdminFinance })));
const AdminDiscovery = lazy(() => import('./pages/admin/AdminDiscovery.jsx').then((m) => ({ default: m.AdminDiscovery })));
const AdminCompliance = lazy(() => import('./pages/admin/AdminCompliance.jsx').then((m) => ({ default: m.AdminCompliance })));
const AdminWebhooks = lazy(() => import('./pages/admin/AdminWebhooks.jsx').then((m) => ({ default: m.AdminWebhooks })));
const AdminFulfillment = lazy(() => import('./pages/admin/AdminFulfillment.jsx').then((m) => ({ default: m.AdminFulfillment })));
const AdminPurchaseOrders = lazy(() => import('./pages/admin/AdminPurchaseOrders.jsx').then((m) => ({ default: m.AdminPurchaseOrders })));
const AdminReceiving = lazy(() => import('./pages/admin/AdminReceiving.jsx').then((m) => ({ default: m.AdminReceiving })));

export default function App() {
  return (
    <BrowserRouter>
      <a href="#main" className="um-skip-link">Skip to content</a>
      <ScrollToTop />
      <Bootstrap />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Homepage />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/quote" element={<Quote />} />
          <Route path="/quote/new" element={<QuoteNew />} />
          <Route path="/quotes/:id/print" element={<QuotePrint />} />
          <Route path="/q/:token" element={<QuoteAccept />} />
          <Route path="/surplus" element={<Surplus />} />
          <Route path="/surplus/market" element={<SurplusMarket />} />
          <Route path="/shortage-list" element={<ShortageMatch />} />
          <Route path="/supply-risk" element={<SupplyRisk />} />
          <Route path="/products/:id" element={<ProductDetail />} />

          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/orders/:id/confirmed" element={<OrderSuccess />} />
          <Route path="/orders/:id/track" element={<TrackOrder />} />

          <Route path="/about" element={<About />} />
          {/* /about/veteran-owned 301→ /procurement at the Vercel edge; client fallback for dev. */}
          <Route path="/about/veteran-owned" element={<Navigate to="/procurement" replace />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/procurement" element={<Procurement />} />
          <Route path="/government" element={<Government />} />
          <Route path="/case-studies/tjs" element={<CaseStudyTJS />} />

          <Route path="/contact" element={<Contact />} />
          <Route path="/support" element={<Support />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/resources/coding" element={<CodingResources />} />

          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/shipping" element={<ShippingPage />} />

          {/* /solutions is killed in prod (Vercel 301 → /services); client fallback for dev. */}
          <Route path="/solutions" element={<Navigate to="/services" replace />} />
          <Route path="/solutions/asc" element={<Navigate to="/segments/asc" replace />} />
          <Route path="/solutions/pharmacy" element={<Navigate to="/segments/pharmacy" replace />} />
          <Route path="/solutions/government" element={<Navigate to="/government" replace />} />
          <Route path="/solutions/distributors" element={<Navigate to="/segments/distributors" replace />} />
          <Route path="/solutions/ems" element={<Navigate to="/segments/ems" replace />} />

          <Route path="/services" element={<Services />} />
          <Route path="/services/distribution" element={<ServiceDistribution />} />
          <Route path="/services/pdac" element={<ServicePDAC />} />
          <Route path="/services/distributors" element={<ServiceDistributors />} />
          <Route path="/services/private-label" element={<ServicePrivateLabel />} />
          {/* Legacy slugs — Vercel 301s these in prod; client fallback in dev. */}
          <Route path="/services/dealer" element={<Navigate to="/services/distributors" replace />} />
          <Route path="/services/education" element={<Navigate to="/blog" replace />} />

          <Route path="/segments/asc" element={<SegmentASC />} />
          {/* /segments/gov 301→ /government at the edge; client fallback for dev. */}
          <Route path="/segments/gov" element={<Navigate to="/government" replace />} />
          <Route path="/segments/pharmacy" element={<SegmentPharmacy />} />
          <Route path="/segments/ems" element={<SegmentEMS />} />
          <Route path="/segments/distributors" element={<SegmentDealers />} />

          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/account/settings" element={<AccountSettings />} />
          <Route path="/account/invoices" element={<Invoices />} />
          <Route path="/account/quotes" element={<AccountQuotes />} />
          <Route path="/account/team" element={<AccountTeam />} />
          <Route path="/invoices/:id/print" element={<InvoicePrint />} />
          <Route path="/portal/quote" element={<PortalQuote />} />
          <Route path="/rep" element={<RepPortal />} />

          <Route path="/admin"           element={<RequireAdmin><AdminOverview /></RequireAdmin>} />
          <Route path="/admin/analytics" element={<RequireAdmin><AdminAnalytics /></RequireAdmin>} />
          <Route path="/admin/inventory" element={<RequireAdmin><AdminInventory /></RequireAdmin>} />
          <Route path="/admin/crm"       element={<RequireAdmin><AdminCRM /></RequireAdmin>} />
          <Route path="/admin/reps"      element={<RequireAdmin><AdminReps /></RequireAdmin>} />
          <Route path="/admin/customers" element={<RequireAdmin><AdminCustomers /></RequireAdmin>} />
          <Route path="/admin/quotes"    element={<RequireAdmin><AdminQuotes /></RequireAdmin>} />
          <Route path="/admin/orders"    element={<RequireAdmin><AdminOrders /></RequireAdmin>} />
          <Route path="/admin/cms"       element={<RequireAdmin><AdminCMS /></RequireAdmin>} />
          <Route path="/admin/vendors"   element={<RequireAdmin><AdminVendorApproval /></RequireAdmin>} />
          <Route path="/admin/products"  element={<RequireAdmin><AdminProducts /></RequireAdmin>} />
          <Route path="/admin/products/new" element={<RequireAdmin><AdminProductEdit /></RequireAdmin>} />
          <Route path="/admin/products/edit/:sku" element={<RequireAdmin><AdminProductEdit /></RequireAdmin>} />
          <Route path="/admin/settings"  element={<RequireAdmin><AdminSettings /></RequireAdmin>} />
          <Route path="/admin/integrations"     element={<RequireAdmin><AdminIntegrations /></RequireAdmin>} />
          <Route path="/admin/integrations/ai"  element={<RequireAdmin><AdminAI /></RequireAdmin>} />
          <Route path="/admin/settings/margin"  element={<RequireAdmin><AdminMarginPolicy /></RequireAdmin>} />
          <Route path="/admin/surplus"          element={<RequireAdmin><AdminSurplus /></RequireAdmin>} />
          <Route path="/admin/products/onboard" element={<RequireAdmin><AdminProductOnboard /></RequireAdmin>} />
          <Route path="/admin/replenishment"    element={<RequireAdmin><AdminReplenishment /></RequireAdmin>} />
          <Route path="/admin/purchase-orders/:id/print" element={<RequireAdmin><PurchaseOrderPrint /></RequireAdmin>} />
          <Route path="/admin/digest"           element={<RequireAdmin><AdminDigest /></RequireAdmin>} />
          <Route path="/admin/finance"          element={<RequireAdmin><AdminFinance /></RequireAdmin>} />
          <Route path="/admin/discovery"        element={<RequireAdmin><AdminDiscovery /></RequireAdmin>} />
          <Route path="/admin/compliance"       element={<RequireAdmin><AdminCompliance /></RequireAdmin>} />
          <Route path="/admin/fulfillment"      element={<RequireAdmin><AdminFulfillment /></RequireAdmin>} />
          <Route path="/admin/purchase-orders"  element={<RequireAdmin><AdminPurchaseOrders /></RequireAdmin>} />
          <Route path="/admin/inventory/receive" element={<RequireAdmin><AdminReceiving /></RequireAdmin>} />
          <Route path="/admin/webhooks"         element={<RequireAdmin><AdminWebhooks /></RequireAdmin>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
