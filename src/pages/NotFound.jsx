import {Link} from 'react-router-dom';
import {Nav} from '../components/layout/Nav.jsx';
import {HomepageFooter} from '../components/layout/HomepageFooter.jsx';
import {useSEO} from '../lib/seo.js';
export function NotFound(){
  useSEO({title:'Page not found',description:'This page is unavailable. Explore the Unite Medical catalog or contact our team.',noindex:true});
  return <><Nav/><main id="main" className="um-static-preview" style={{paddingTop:150}}><p className="um-static-label">404 / PAGE NOT FOUND</p><h1>Let’s get you to the right place.</h1><p>This link may have changed. Our catalog and team can help you find what you need.</p><nav aria-label="Continue browsing"><Link to="/catalog">Explore products ↗</Link><Link to="/contact">Contact our team ↗</Link></nav></main><HomepageFooter/></>;
}
