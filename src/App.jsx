import React, { useEffect, useState } from "react";

export default function App() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Menunggu aksi...");
  const [coords, setCoords] = useState(null);
  const [address, setAddress] = useState(null);
  const [adm4, setAdm4] = useState("");
  const [forecast, setForecast] = useState(null);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Normalize strings for matching
  const normalize = (s = "") =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .trim();

  // Step 1: get geolocation
  const askLocation = () => {
    setStatus("Meminta izin lokasi...");
    setError(null);
    if (!navigator.geolocation) {
      setError("Geolocation tidak didukung browser.");
      setStatus("Gagal: geolocation tidak tersedia.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lon: longitude });
        setStatus(`Lokasi diperoleh: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        reverseGeocode(latitude, longitude);
      },
      (err) => {
        setError("Izin lokasi ditolak atau error: " + err.message);
        setLoading(false);
        setStatus("Gagal mendapatkan lokasi.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  // Step 2: reverse geocode using Nominatim
  const reverseGeocode = async (lat, lon) => {
    try {
      setStatus("Mencari alamat (reverse geocode)...");
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=id`;
      const res = await fetch(url, { headers: { "User-Agent": "weather-app-example/1.0" } });
      if (!res.ok) throw new Error(`Reverse geocode error ${res.status}`);
      const data = await res.json();
      const addr = data.address || {};
      
      const result = {
        display_name: data.display_name,
        village: addr.village || addr.hamlet || addr.suburb || addr.neighbourhood || addr.town,
        district: addr.county || addr.city || addr.municipality || addr.town || "",
        subdistrict: addr.suburb || addr.city_district || addr.village || "",
        city: addr.city || addr.town || addr.municipality || addr.county || "",
        province: addr.state || "",
      };
      setAddress(result);
      setStatus("Alamat ditemukan: " + (result.display_name || "—"));
      tryResolveAdm4(result);
    } catch (e) {
      console.error("Reverse geocode failed", e);
      setError("Gagal reverse geocode: " + e.message);
      setLoading(false);
      setStatus("Gagal reverse geocode");
    }
  };

  // Step 3: try to resolve adm4 via wilayah.id
  const tryResolveAdm4 = async (addr) => {
    setStatus("Mencari kode wilayah (adm4) otomatis...");
    try {
      // Get provinces and find matching province code
      const provRes = await fetch("https://wilayah.id/api/provinces.json");
      if (!provRes.ok) throw new Error("Gagal ambil provinces.json");
      const provJson = await provRes.json();
      const provMatches = provJson.data || [];
      const provNameNormalized = normalize(addr.province || "");

      // Find best province match
      let prov = provMatches.find((p) => normalize(p.name).includes(provNameNormalized) || provNameNormalized.includes(normalize(p.name)));
      if (!prov && provNameNormalized) {
        prov = provMatches.find((p) => normalize(p.name).split(" ")[0] === provNameNormalized.split(" ")[0]);
      }
      if (!prov) {
        setError("Provinsi tidak ditemukan. Silakan cari manual.");
        setLoading(false);
        return;
      }
      
      const provCode = prov?.code;
      
      // Get regencies (kab/kota)
      const regRes = await fetch(`https://wilayah.id/api/regencies/${provCode}.json`);
      if (!regRes.ok) throw new Error("Gagal ambil regencies");
      const regJson = await regRes.json();
      const regMatches = regJson.data || [];
      const cityName = normalize(addr.city || addr.county || addr.district || "");
      let reg = regMatches.find((r) => normalize(r.name).includes(cityName) || cityName.includes(normalize(r.name)));
      if (!reg && cityName) {
        reg = regMatches.find((r) => normalize(r.name).split(" ")[0] === cityName.split(" ")[0]);
      }
      if (!reg) {
        setError("Kabupaten/Kota tidak ditemukan. Silakan cari manual.");
        setLoading(false);
        return;
      }

      const regCode = reg?.code;
      
      // Get districts (kecamatan)
      const distRes = await fetch(`https://wilayah.id/api/districts/${regCode}.json`);
      if (!distRes.ok) throw new Error("Gagal ambil districts");
      const distJson = await distRes.json();
      const distMatches = distJson.data || [];
      const kecName = normalize(addr.subdistrict || addr.village || addr.city || "");
      let dist = distMatches.find((d) => normalize(d.name).includes(kecName) || kecName.includes(normalize(d.name)));
      if (!dist && kecName) {
        dist = distMatches.find((d) => normalize(d.name).split(" ")[0] === kecName.split(" ")[0]);
      }
      if (!dist) {
        setError("Kecamatan tidak ditemukan. Silakan cari manual.");
        setLoading(false);
        return;
      }
      
      const distCode = dist?.code;
      
      // Get villages
      const villRes = await fetch(`https://wilayah.id/api/villages/${distCode}.json`);
      if (!villRes.ok) throw new Error("Gagal ambil villages");
      const villJson = await villRes.json();
      const villMatches = villJson.data || [];
      const villageName = normalize(addr.village || addr.subdistrict || addr.county || "");
      let vill = villMatches.find((v) => normalize(v.name).includes(villageName) || villageName.includes(normalize(v.name)));
      if (!vill && villageName) {
        vill = villMatches.find((v) => normalize(v.name).split(" ")[0] === villageName.split(" ")[0]);
      }
      
      if (!vill) {
        setError("Desa/Kelurahan tidak ditemukan. Silakan cari manual.");
        setLoading(false);
        return;
      }

      setAdm4(vill.code);
      setStatus(`Kode adm4 terdeteksi: ${vill.code} — ${vill.name}`);
      await fetchBMKG(vill.code);
    } catch (e) {
      console.error("Resolve adm4 failed", e);
      setError("Auto-detect adm4 gagal: " + e.message);
      setStatus("Auto-detect adm4 gagal — silakan cari lokasi manual.");
      setLoading(false);
    }
  };

  // Step 4: fetch BMKG forecast
  const fetchBMKG = async (kode) => {
    try {
      setStatus("Mengambil data prakiraan cuaca dari BMKG...");
      // Using a proxy to avoid CORS issues
      const proxyUrl = "https://cors-anywhere.herokuapp.com/";
      const targetUrl = `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${encodeURIComponent(kode)}`;
      const res = await fetch(proxyUrl + targetUrl, {
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      if (!res.ok) throw new Error(`BMKG API error ${res.status}`);
      const body = await res.json();
      setForecast(body);
      setStatus("Data prakiraan cuaca berhasil diambil.");
      setLoading(false);
    } catch (e) {
      console.error("BMKG fetch failed", e);
      setError("Gagal mengambil data BMKG: " + e.message);
      setLoading(false);
      setStatus("Gagal memuat prakiraan cuaca.");
    }
  };

  // Manual fetch when user types adm4 and presses button
  const manualFetch = async () => {
    if (!adm4) {
      setError("Masukkan kode adm4 dulu.");
      return;
    }
    setLoading(true);
    setError(null);
    await fetchBMKG(adm4);
  };

  // Search for locations
  const searchLocation = async (query) => {
    if (!query || query.length < 3) return;
    
    try {
      setStatus("Mencari lokasi...");
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=id&accept-language=id`;
      const res = await fetch(url, { headers: { "User-Agent": "weather-app-example/1.0" } });
      if (!res.ok) throw new Error(`Search error ${res.status}`);
      const data = await res.json();
      setSearchResults(data.slice(0, 5));
      setShowSearchResults(true);
      setStatus(`${data.length} hasil ditemukan untuk "${query}"`);
    } catch (e) {
      console.error("Search failed", e);
      setError("Gagal mencari lokasi: " + e.message);
    }
  };

  // Handle search result selection
  const handleSearchSelect = (result) => {
    setSearchQuery(result.display_name);
    setShowSearchResults(false);
    setCoords({ lat: parseFloat(result.lat), lon: parseFloat(result.lon) });
    setStatus(`Lokasi dipilih: ${result.display_name}`);
    reverseGeocode(parseFloat(result.lat), parseFloat(result.lon));
  };

  // Render forecast data
  const renderForecast = () => {
    if (!forecast) return null;
    const lokasi = forecast.lokasi || forecast.data?.[0]?.lokasi || {};
    const cuaca = forecast.data?.[0]?.cuaca || [];
    
    return (
      <div className="space-y-4">
        <div className="p-4 bg-white rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-800">
            {lokasi.desa ? `${lokasi.desa}, ` : ""}
            {lokasi.kecamatan ? `${lokasi.kecamatan}, ` : ""}
            {lokasi.kotkab ? `${lokasi.kotkab}, ` : ""}
            {lokasi.provinsi || ""}
          </h2>
          <p className="text-sm text-gray-600">Kode Wilayah: {lokasi.adm4 || adm4}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cuaca.map((hari, idx) => (
            <div key={idx} className="bg-white rounded-lg shadow-md p-4">
              <h3 className="font-medium text-lg text-center mb-3 text-blue-600">Hari ke-{idx + 1}</h3>
              <div className="space-y-3">
                {Array.isArray(hari) &&
                  hari.map((slot, sidx) => (
                    <div key={sidx} className="border border-gray-200 p-3 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-gray-700 font-medium">{slot.local_datetime || slot.datetime}</div>
                          <div className="font-semibold text-gray-800">{slot.weather_desc}</div>
                        </div>
                        {slot.image && (
                          <img src={slot.image} alt={slot.weather_desc} className="w-12 h-12" />
                        )}
                      </div>
                      <div className="mt-2 text-sm text-gray-600">
                        <div>Suhu: {slot.t}°C</div>
                        <div>Kelembaban: {slot.hu}%</div>
                        <div>Curah Hujan: {slot.tp} mm</div>
                        <div>Angin: {slot.wd} {slot.ws} km/j</div>
                        <div>Visibilitas: {slot.vs_text}</div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-blue-800">Weather Dashboard BMKG</h1>
          <p className="text-sm md:text-base text-gray-600 mt-2">
            Dapatkan informasi cuaca terkini untuk lokasi Anda di Indonesia
          </p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <section className="lg:col-span-1 bg-white p-4 md:p-6 rounded-xl shadow-lg">
            <h2 className="font-semibold text-lg text-blue-700 mb-4">Kontrol</h2>
            <div className="space-y-4">
              <button
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                onClick={askLocation}
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Memproses...
                  </span>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    Deteksi Lokasi Otomatis
                  </>
                )}
              </button>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-medium text-gray-700 mb-2">Cari Lokasi Manual</h3>
                <div className="relative">
                  <input
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      searchLocation(e.target.value);
                    }}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Cari kota atau daerah..."
                  />
                  {showSearchResults && searchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg border border-gray-200 max-h-60 overflow-auto">
                      {searchResults.map((result, index) => (
                        <div
                          key={index}
                          className="px-4 py-2 hover:bg-blue-50 cursor-pointer"
                          onClick={() => handleSearchSelect(result)}
                        >
                          <div className="font-medium">{result.display_name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-medium text-gray-700 mb-2">Kode ADM4 Manual</h3>
                <input
                  value={adm4}
                  onChange={(e) => setAdm4(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 mb-2"
                  placeholder="Contoh: 31.71.03.1001"
                />
                <button 
                  className="w-full bg-gray-800 text-white py-2 rounded-lg hover:bg-gray-900 transition-colors"
                  onClick={manualFetch}
                >
                  Ambil Data BMKG
                </button>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-medium text-gray-700 mb-2">Status</h3>
                <div className="bg-gray-100 p-3 rounded-lg">
                  <p className="text-sm text-gray-700">{status}</p>
                  {error && (
                    <p className="text-sm text-red-600 mt-2 bg-red-50 p-2 rounded">Error: {error}</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Main Content */}
          <section className="lg:col-span-3 bg-white p-4 md:p-6 rounded-xl shadow-lg">
            <h2 className="font-semibold text-lg text-blue-700 mb-4">Prakiraan Cuaca</h2>
            
            {address && (
              <div className="mb-4 p-3 border border-blue-200 rounded-lg bg-blue-50">
                <div className="text-sm text-blue-700 font-medium">Alamat Terdeteksi:</div>
                <div className="font-medium text-gray-800">{address.display_name}</div>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="text-center">
                  <svg className="animate-spin mx-auto h-12 w-12 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="mt-4 text-gray-600">Memuat data cuaca...</p>
                </div>
              </div>
            ) : forecast ? (
              renderForecast()
            ) : (
              <div className="text-center py-10 text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
                <p className="mt-4">Data cuaca belum tersedia. Silakan deteksi lokasi atau cari manual.</p>
              </div>
            )}
          </section>
        </main>

        <footer className="mt-8 text-center text-xs text-gray-500">
          <p>Data cuaca disediakan oleh BMKG. Data wilayah dari wilayah.id. Jika mengalami masalah CORS, gunakan extension CORS Unblock.</p>
        </footer>
      </div>
    </div>
  );
}