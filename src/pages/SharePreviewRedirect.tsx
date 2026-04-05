import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function buildCanonicalPath(search: string) {
  const params = new URLSearchParams(search);
  const userToken = String(params.get('u') || '').trim();
  const canvasToken = String(params.get('c') || '').trim();
  const pageToken = String(params.get('p') || '').trim();

  if (!userToken || !canvasToken || !pageToken) {
    return '/';
  }

  return `/${encodeURIComponent(userToken)}?${encodeURIComponent(canvasToken)}=${encodeURIComponent(pageToken)}.page`;
}

export default function SharePreviewRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const nextPath = buildCanonicalPath(location.search);
    navigate(nextPath, { replace: true });
  }, [location.search, navigate]);

  return null;
}
