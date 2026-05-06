import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { ScrollToTop } from './components/layout/ScrollToTop.jsx';
import { PageLoader } from './components/layout/PageLoader.jsx';
import { Bootstrap } from './components/layout/Bootstrap.jsx';
import { RequireAdmin } from './components/layout/RequireAdmin.jsx';

const Homepage = lazy(() => import('./pages/Homepage.jsx').then((m) => ({ default: m.Homepage })));
const Catalog = lazy(() => import('./pages/Catalog.jsx').then((m) => ({ default: m.Catalog })));
const Quote = lazy(() => import('./pages/Quote.jsx').then((m) => ({ default: m.Quote })));
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
const Solutions = lazy(() => import('./pages/Solutions.jsx').then((m) => ({ default: m.Solutions })));
const Compliance = lazy(() => import('./pages/Compliance.jsx').then((m) => ({ default: m.Compliance })));
const VeteranOwned = lazy(() => import('./pages/VeteranOwned.jsx').then((m) => ({ default: m.VeteranOwned })));
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
const ServiceDealer = lazy(() => import('./pages/ServiceDealer.jsx').then((m) => ({ default: m.ServiceDealer })));
const ServiceEducation = lazy(() => import('./pages/ServiceEducation.jsx').then((m) => ({ default: m.ServiceEducation })));
const SegmentASC = lazy(() => import('./pages/segments/SegmentASC.jsx').then((m) => ({ default: m.SegmentASC })));
const SegmentGov = lazy(() => import('./pages/segments/SegmentGov.jsx').then((m) => ({ default: m.SegmentGov })));
const SegmentPharmacy = lazy(() => import('./pages/segments/SegmentPharmacy.jsx').then((m) => ({ default: m.SegmentPharmacy })));
const SegmentEMS = lazy(() => import('./pages/segments/SegmentEMS.jsx').then((m) => ({ default: m.SegmentEMS })));
const SegmentDealers = lazy(() => import('./pages/segments/SegmentDealers.jsx').then((m) => ({ default: m.SegmentDealers })));
const Login = lazy(() => import('./pages/Login.jsx').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Register.jsx').then((m) => ({ default: m.Register })));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx').then((m) => ({ default: m.Dashboard })));
const AccountSettings = lazy(() => import('./pages/AccountSettings.jsx').then((m) => ({ default: m.AccountSettings })));
const Invoices = lazy(() => import('./pages/Invoices.jsx').then((m) => ({ default: m.Invoices })));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview.jsx').then((m) => ({ default: m.AdminOverview })));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics.jsx').then((m) => ({ default: m.AdminAnalytics })));
const AdminInventory = lazy(() => import('./pages/admin/AdminInventory.jsx').then((m) => ({ default: m.AdminInventory })));
const AdminCRM = lazy(() => import('./pages/admin/AdminCRM.jsx').then((m) => ({ default: m.AdminCRM })));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders.jsx').then((m) => ({ default: m.AdminOrders })));
const AdminCMS = lazy(() => import('./pages/admin/AdminCMS.jsx').then((m) => ({ default: m.AdminCMS })));
const AdminVendorApproval = lazy(() => import('./pages/admin/AdminVendorApproval.jsx').then((m) => ({ default: m.AdminVendorApproval })));
const AdminQuotes = lazy(() => import('./pages/admin/AdminQuotes.jsx').then((m) => ({ default: m.AdminQuotes })));
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers.jsx').then((m) => ({ default: m.AdminCustomers })));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts.jsx').then((m) => ({ default: m.AdminProducts })));
const AdminProductEdit = lazy(() => import('./pages/admin/AdminProductEdit.jsx').then((m) => ({ default: m.AdminProductEdit })));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings.jsx').then((m) => ({ default: m.AdminSettings })));

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
          <Route path="/products/:id" element={<ProductDetail />} />

          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/orders/:id/confirmed" element={<OrderSuccess />} />
          <Route path="/orders/:id/track" element={<TrackOrder />} />

          <Route path="/about" element={<About />} />
          <Route path="/about/veteran-owned" element={<VeteranOwned />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/procurement" element={<Procurement />} />

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

          <Route path="/solutions" element={<Solutions />} />
          <Route path="/solutions/asc" element={<Navigate to="/segments/asc" replace />} />
          <Route path="/solutions/pharmacy" element={<Navigate to="/segments/pharmacy" replace />} />
          <Route path="/solutions/government" element={<Navigate to="/segments/gov" replace />} />
          <Route path="/solutions/distributors" element={<Navigate to="/segments/distributors" replace />} />
          <Route path="/solutions/ems" element={<Navigate to="/segments/ems" replace />} />

          <Route path="/services" element={<Services />} />
          <Route path="/services/distribution" element={<ServiceDistribution />} />
          <Route path="/services/pdac" element={<ServicePDAC />} />
          <Route path="/services/dealer" element={<ServiceDealer />} />
          <Route path="/services/education" element={<ServiceEducation />} />

          <Route path="/segments/asc" element={<SegmentASC />} />
          <Route path="/segments/gov" element={<SegmentGov />} />
          <Route path="/segments/pharmacy" element={<SegmentPharmacy />} />
          <Route path="/segments/ems" element={<SegmentEMS />} />
          <Route path="/segments/distributors" element={<SegmentDealers />} />

          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/account/settings" element={<AccountSettings />} />
          <Route path="/account/invoices" element={<Invoices />} />

          <Route path="/admin"           element={<RequireAdmin><AdminOverview /></RequireAdmin>} />
          <Route path="/admin/analytics" element={<RequireAdmin><AdminAnalytics /></RequireAdmin>} />
          <Route path="/admin/inventory" element={<RequireAdmin><AdminInventory /></RequireAdmin>} />
          <Route path="/admin/crm"       element={<RequireAdmin><AdminCRM /></RequireAdmin>} />
          <Route path="/admin/customers" element={<RequireAdmin><AdminCustomers /></RequireAdmin>} />
          <Route path="/admin/quotes"    element={<RequireAdmin><AdminQuotes /></RequireAdmin>} />
          <Route path="/admin/orders"    element={<RequireAdmin><AdminOrders /></RequireAdmin>} />
          <Route path="/admin/cms"       element={<RequireAdmin><AdminCMS /></RequireAdmin>} />
          <Route path="/admin/vendors"   element={<RequireAdmin><AdminVendorApproval /></RequireAdmin>} />
          <Route path="/admin/products"  element={<RequireAdmin><AdminProducts /></RequireAdmin>} />
          <Route path="/admin/products/new" element={<RequireAdmin><AdminProductEdit /></RequireAdmin>} />
          <Route path="/admin/products/edit/:sku" element={<RequireAdmin><AdminProductEdit /></RequireAdmin>} />
          <Route path="/admin/settings"  element={<RequireAdmin><AdminSettings /></RequireAdmin>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
