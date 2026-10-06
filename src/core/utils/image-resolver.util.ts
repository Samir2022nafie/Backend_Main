/**
 * Resolves image URLs including Google Images share redirects, Pinterest pins, and web redirects
 * into direct binary image URLs.
 */
export async function resolveDirectImageUrl(rawUrl?: string | null): Promise<string | null> {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const rawTrimmed = rawUrl.trim();
  const cropIdx = rawTrimmed.indexOf('#crop=');
  const cleanUrl = cropIdx !== -1 ? rawTrimmed.slice(0, cropIdx).trim() : rawTrimmed;
  const cropSuffix = cropIdx !== -1 ? rawTrimmed.slice(cropIdx).trim() : '';

  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) return rawTrimmed;

  const withCrop = (url: string) => (cropSuffix ? `${url}${cropSuffix}` : url);

  // If already contains Google Images imgurl parameter, extract directly
  const directImgParam = cleanUrl.match(/[?&]imgurl=([^&]+)/);
  if (directImgParam) {
    try {
      return withCrop(decodeURIComponent(directImgParam[1]));
    } catch {}
  }

  // If it's already a direct image extension, return as-is
  if (/\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(cleanUrl)) {
    return withCrop(cleanUrl);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(cleanUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    const contentType = res.headers.get('content-type') || '';
    if (contentType.startsWith('image/')) {
      return withCrop(res.url);
    }

    const finalUrl = res.url;
    const finalImgParam = finalUrl.match(/[?&]imgurl=([^&]+)/);
    if (finalImgParam) {
      try {
        return withCrop(decodeURIComponent(finalImgParam[1]));
      } catch {}
    }

    const html = await res.text();
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch && ogMatch[1]) {
      return withCrop(ogMatch[1]);
    }

    return withCrop(finalUrl);
  } catch {
    return rawTrimmed;
  }
}
