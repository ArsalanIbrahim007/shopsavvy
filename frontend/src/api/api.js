const BASE_URL = "http://localhost:5000/api";

export async function searchProducts(query) {
  try {
    const response = await fetch(
      `${BASE_URL}/listings/search?q=${encodeURIComponent(query)}`
    );

    if (!response.ok) {
      throw new Error("Backend returned an error");
    }

    const data = await response.json();

    // An empty result is a valid answer, not a failure. Returning a shaped
    // object here (rather than null) lets the page show a real empty state
    // instead of falling back to placeholder products.
    return {
      products: data.data || [],
      summary: data.summary || null,
      groups: data.groups || [],
      groupCount: data.groupCount || 0,
      error: false,
    };
  } catch (error) {
    console.warn("Backend unavailable:", error.message);
    return { products: [], summary: null, groups: [], groupCount: 0, error: true };
  }
}