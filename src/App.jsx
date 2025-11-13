import React, { useEffect, useState } from "react";

export default function App() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Menunggu aksi...");
  const [coords, setCoords] = useState(null);
  const [address, setAddress] = useState(null);
  const [currentWeather, setCurrentWeather] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

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
        fetchWeatherData(latitude, longitude);
      },
      (err) => {
        setError("Izin lokasi ditolak atau error: " + err.message);
        setLoading(false);
        setStatus("Gagal mendapatkan lokasi.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  // Step 2: fetch weather data from Open-Meteo
  const fetchWeatherData = async (lat, lon) => {
    try {
      setStatus("Mengambil data cuaca dari Open-Meteo...");

      // Fetch current weather
      const currentUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
      const currentRes = await fetch(currentUrl);
      if (!currentRes.ok) throw new Error(`Current weather API error ${currentRes.status}`);
      const currentData = await currentRes.json();
      
      // Transform Open-Meteo data to match our expected format
      const transformedCurrentWeather = {
        name: "Lokasi Anda",
        sys: { country: "ID" },
        weather: [
          {
            description: getWeatherDescription(currentData.current_weather.weathercode),
            icon: getWeatherIcon(currentData.current_weather.weathercode, currentData.current_weather.is_day),
            main: getWeatherMain(currentData.current_weather.weathercode)
          }
        ],
        main: {
          temp: currentData.current_weather.temperature,
          feels_like: currentData.current_weather.temperature, // Open-Meteo doesn't provide feels_like
          humidity: null, // Open-Meteo doesn't provide humidity in basic endpoint
          pressure: null  // Open-Meteo doesn't provide pressure in basic endpoint
        },
        wind: {
          speed: currentData.current_weather.windspeed
        },
        dt: Math.floor(new Date(currentData.current_weather.time).getTime() / 1000),
        timezone: currentData.timezone_abbreviation
      };

      setCurrentWeather(transformedCurrentWeather);

      // Fetch 7-day forecast
      const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`;
      const forecastRes = await fetch(forecastUrl);
      if (!forecastRes.ok) throw new Error(`Forecast API error ${forecastRes.status}`);
      const forecastData = await forecastRes.json();

      // Transform forecast data
      const transformedForecast = {
        list: forecastData.daily.time.map((time, index) => ({
          dt: Math.floor(new Date(time).getTime() / 1000),
          main: {
            temp: (forecastData.daily.temperature_2m_max[index] + forecastData.daily.temperature_2m_min[index]) / 2,
            temp_min: forecastData.daily.temperature_2m_min[index],
            temp_max: forecastData.daily.temperature_2m_max[index],
            humidity: null
          },
          weather: [
            {
              description: getWeatherDescription(forecastData.daily.weathercode[index]),
              icon: getWeatherIcon(forecastData.daily.weathercode[index], 1), // Assume day time for forecast
              main: getWeatherMain(forecastData.daily.weathercode[index])
            }
          ]
        }))
      };

      setForecast(transformedForecast);

      // Try to get address from reverse geocoding
      try {
        const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
        const geoRes = await fetch(geoUrl);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          setAddress({
            display_name: geoData.display_name,
            city: geoData.address.city || geoData.address.town || geoData.address.village,
            country: geoData.address.country
          });
        } else {
          setAddress({
            display_name: `Lokasi (${lat.toFixed(3)}, ${lon.toFixed(3)})`,
            city: "Lokasi Anda",
            country: "ID"
          });
        }
      } catch (geoError) {
        console.warn("Reverse geocoding failed:", geoError);
        setAddress({
          display_name: `Lokasi (${lat.toFixed(3)}, ${lon.toFixed(3)})`,
          city: "Lokasi Anda",
          country: "ID"
        });
      }

      setStatus("Data cuaca berhasil diambil dari Open-Meteo.");
      setLoading(false);
    } catch (e) {
      console.error("Open-Meteo fetch failed", e);
      setError("Gagal mengambil data cuaca: " + e.message);
      setLoading(false);
      setStatus("Gagal memuat data cuaca.");
    }
  };

  // Weather code mapping for Open-Meteo
  const getWeatherDescription = (code) => {
    const weatherCodes = {
      0: "Cerah",
      1: "Sebagian cerah",
      2: "Berawan",
      3: "Mendung",
      45: "Berkabut",
      48: "Berkabut deposisi rime",
      51: "Gerimis ringan",
      53: "Gerimis sedang",
      55: "Gerimis lebat",
      56: "Gerimis beku ringan",
      57: "Gerimis beku lebat",
      61: "Hujan ringan",
      63: "Hujan sedang",
      65: "Hujan lebat",
      66: "Hujan beku ringan",
      67: "Hujan beku lebat",
      71: "Salju ringan",
      73: "Salju sedang",
      75: "Salju lebat",
      77: "Butiran salju",
      80: "Hujan deras ringan",
      81: "Hujan deras sedang",
      82: "Hujan deras lebat",
      85: "Hujan salju ringan",
      86: "Hujan salju lebat",
      95: "Badai petir",
      96: "Badai petir dengan hujan es ringan",
      99: "Badai petir dengan hujan es lebat"
    };
    return weatherCodes[code] || "Tidak diketahui";
  };

  const getWeatherMain = (code) => {
    if (code === 0) return "Clear";
    if (code <= 3) return "Clouds";
    if (code <= 48) return "Fog";
    if (code <= 67) return "Rain";
    if (code <= 77) return "Snow";
    if (code <= 86) return "Rain";
    if (code <= 99) return "Thunderstorm";
    return "Clear";
  };

  const getWeatherIcon = (code, isDay) => {
    const baseIcons = {
      0: isDay ? "01d" : "01n", // Clear sky
      1: isDay ? "02d" : "02n", // Mainly clear
      2: isDay ? "03d" : "03n", // Partly cloudy
      3: "04", // Overcast
      45: "50", // Fog
      48: "50", // Fog
      51: "09", // Drizzle
      53: "09", // Drizzle
      55: "09", // Drizzle
      61: "10", // Rain
      63: "10", // Rain
      65: "10", // Rain
      71: "13", // Snow
      73: "13", // Snow
      75: "13", // Snow
      77: "13", // Snow grains
      80: "09", // Rain showers
      81: "09", // Rain showers
      82: "09", // Rain showers
      85: "13", // Snow showers
      86: "13", // Snow showers
      95: "11", // Thunderstorm
      96: "11", // Thunderstorm with hail
      99: "11"  // Thunderstorm with hail
    };
    
    const baseIcon = baseIcons[code] || "01d";
    return baseIcon.length === 2 ? (isDay ? `${baseIcon}d` : `${baseIcon}n`) : baseIcon;
  };

  // Search for locations using Nominatim (OpenStreetMap)
  const searchLocation = async (query) => {
    if (!query || query.length < 3) return;
    
    try {
      setStatus("Mencari lokasi...");

      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Search error ${res.status}`);
      const data = await res.json();
      
      const transformedResults = data.map(item => ({
        display_name: item.display_name,
        lat: item.lat,
        lon: item.lon,
        name: item.name || item.display_name.split(',')[0],
        country: item.address?.country,
        state: item.address?.state
      }));
      
      setSearchResults(transformedResults);
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
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    setCoords({ lat, lon });
    setStatus(`Lokasi dipilih: ${result.display_name}`);
    setLoading(true);
    fetchWeatherData(lat, lon);
  };

  // Format date
  const formatDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get weather icon URL
  const getIconUrl = (iconCode) => {
    return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  };

  // Group forecast by day (already grouped from API)
  const groupForecastByDay = () => {
    if (!forecast || !forecast.list) return [];
    
    return forecast.list.map((item, index) => [index.toString(), [item]]);
  };

  // Render current weather
  const renderCurrentWeather = () => {
    if (!currentWeather) return null;
    
    return (
      <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white p-6 rounded-xl shadow-lg mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              {address?.city || currentWeather.name}, {address?.country || currentWeather.sys.country}
            </h2>
            <p className="text-blue-100 capitalize">{currentWeather.weather[0].description}</p>
            <div className="flex items-center mt-2">
              <span className="text-4xl font-bold">{Math.round(currentWeather.main.temp)}°C</span>
              <img 
                src={getIconUrl(currentWeather.weather[0].icon)} 
                alt={currentWeather.weather[0].description}
                className="w-16 h-16 ml-2"
              />
            </div>
          </div>
          <div className="text-right">
            <p className="text-blue-100">Angin: {Math.round(currentWeather.wind.speed)} km/j</p>
            <p className="text-blue-100">Arah angin: {currentWeather.wind.direction || 'Tidak tersedia'}</p>
            {currentWeather.main.humidity && (
              <p className="text-blue-100">Kelembaban: {currentWeather.main.humidity}%</p>
            )}
            {currentWeather.main.pressure && (
              <p className="text-blue-100">Tekanan: {currentWeather.main.pressure} hPa</p>
            )}
          </div>
        </div>
        <div className="flex justify-between mt-4 text-sm text-blue-100">
          <span>Terakhir diperbarui: {formatTime(currentWeather.dt)}</span>
          <span>Zona waktu: {currentWeather.timezone}</span>
        </div>
      </div>
    );
  };

  // Render forecast
  const renderForecast = () => {
    if (!forecast) return null;
    
    const groupedForecast = groupForecastByDay();
    
    return (
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-800">Prakiraan 7 Hari</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupedForecast.map(([date, items], idx) => {
            const dayData = items[0];
            
            return (
              <div key={idx} className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
                <h4 className="font-medium text-gray-800 text-center mb-3">
                  {idx === 0 ? 'Hari ini' : formatDate(dayData.dt)}
                </h4>
                <div className="text-center mb-3">
                  <img 
                    src={getIconUrl(dayData.weather[0].icon)} 
                    alt={dayData.weather[0].description}
                    className="w-12 h-12 mx-auto"
                  />
                  <p className="text-sm text-gray-600 capitalize">{dayData.weather[0].description}</p>
                </div>
                <div className="text-center">
                  <div className="flex justify-center items-center space-x-2">
                    <span className="text-lg font-semibold text-gray-800">{Math.round(dayData.main.temp_max)}°</span>
                    <span className="text-lg text-gray-500">{Math.round(dayData.main.temp_min)}°</span>
                  </div>
                  {dayData.main.humidity && (
                    <p className="text-xs text-gray-500 mt-1">Kelembaban: {dayData.main.humidity}%</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-blue-800">Weather Dashboard</h1>
          <p className="text-sm md:text-base text-gray-600 mt-2">
            Dapatkan informasi cuaca terkini dengan Open-Meteo API
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
                <h3 className="font-medium text-gray-700 mb-2">Status</h3>
                <div className="bg-gray-100 p-3 rounded-lg">
                  <p className="text-sm text-gray-700">{status}</p>
                  {error && (
                    <div className="text-sm text-red-600 mt-2 bg-red-50 p-2 rounded">
                      <div className="font-medium">Error:</div>
                      <div>{error}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Main Content */}
          <section className="lg:col-span-3 bg-white p-4 md:p-6 rounded-xl shadow-lg">
            <h2 className="font-semibold text-lg text-blue-700 mb-4">Data Cuaca</h2>
            
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
            ) : currentWeather ? (
              <div>
                {renderCurrentWeather()}
                {renderForecast()}
              </div>
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
          <p>Data cuaca disediakan oleh Open-Meteo. API gratis tanpa batas penggunaan.</p>
        </footer>
      </div>
    </div>
  );
}