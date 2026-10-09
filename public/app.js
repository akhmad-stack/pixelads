const adGrid = document.getElementById("ad-grid");

async function loadAds() {
try {
const response = await fetch("/api/ads");

if (!response.ok) {
  throw new Error("Gagal memuat iklan");
}

const ads = await response.json();

if (!Array.isArray(ads) || ads.length === 0) {
  adGrid.textContent = "Belum ada iklan. Jadilah pengiklan pertama!";
  return;
}

adGrid.replaceChildren();

ads.forEach((ad) => {
  const card = document.createElement("article");
  card.className = "ad-card";

  if (ad.image_url) {
    const image = document.createElement("img");
    image.src = ad.image_url;
    image.alt = ad.title || "Iklan PixelAds";
    card.appendChild(image);
  }

  const title = document.createElement("h3");
  title.textContent = ad.title || "Iklan";
  card.appendChild(title);

  if (ad.target_url) {
    const link = document.createElement("a");
    link.href = ad.target_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Kunjungi iklan";
    card.appendChild(link);
  }

  adGrid.appendChild(card);
});

} catch (error) {
adGrid.textContent = "Iklan belum dapat dimuat. Silakan coba lagi.";
}
}

loadAds();
