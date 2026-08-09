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

    console.log("API RESPONSE SUCCESS:", data.success, "COUNT:", data.count);

    if (data.success && data.data && data.data.length > 0) {
      return {
        products: data.data,
        summary: data.summary,
        groups: data.groups,
      };
    }

    return null;

  } catch (error) {
    console.warn("Backend not available, using dummy data:", error.message);
    return null;
  }
}