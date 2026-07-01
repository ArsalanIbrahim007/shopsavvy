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

    if (data.success && data.data.length > 0) {
      return data.data;
    }

    return null;

  } catch (error) {
    console.warn("Backend not available, using dummy data:", error.message);
    return null;
  }
}