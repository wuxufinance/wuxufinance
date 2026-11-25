// Preserve existing bookmarks on the current origin without exposing protected lessons.
const h=location.hash;if(/^#\/(?:course|catalog|lab|review|progress|account|purchase|auth)(?:\/|$)|^#setup=/.test(h))location.replace(new URL('./learn/'+h,import.meta.url).href);
