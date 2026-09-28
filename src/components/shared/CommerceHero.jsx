import { Link } from 'react-router-dom';

/** Shared photographic masthead for the public buying journey. */
export function CommerceHero({ eyebrow, title, accent, description, image, imageAlt, action, index }) {
  return <header className="umc-masthead">
    <div className="umc-masthead-image"><img src={image} alt={imageAlt} fetchPriority="high" /></div>
    <div className="umc-masthead-shade" aria-hidden="true" />
    <div className="uc-wrap umc-masthead-content">
      <p className="uc-eyebrow">UNITE MEDICAL / {eyebrow}</p>
      <h1>{title}<br /><span>{accent}</span></h1>
      <div className="umc-masthead-bottom"><p>{description}</p>{action&&<Link to={action.to}>{action.label}<span aria-hidden="true">↗</span></Link>}</div>
      <span className="umc-page-index" aria-hidden="true">{index} / MEDICAL SUPPLY, SIMPLIFIED</span>
    </div>
  </header>;
}
