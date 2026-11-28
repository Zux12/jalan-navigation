// Locationforecast supplies the issue time separately from each forecast hour.
(() => {
  'use strict';
  const hour = 3600000;
  const towns = [
    ['Kuala Lumpur',3.14,101.69], ['Kuantan',3.81,103.33], ['George Town',5.41,100.33],
    ['Johor Bahru',1.46,103.76], ['Kota Bharu',6.13,102.24], ['Ipoh',4.60,101.09],
    ['Melaka',2.19,102.25], ['Kuala Terengganu',5.33,103.14], ['Alor Setar',6.12,100.37],
    ['Seremban',2.73,101.94], ['Kangar',6.44,100.20], ['Putrajaya',2.93,101.69],
    ['Shah Alam',3.07,101.52], ['Langkawi',6.33,99.84], ['Temerloh',3.45,102.42],
    ['Segamat',2.51,102.82], ['Gua Musang',4.88,101.97], ['Mersing',2.43,103.84],
    ['Kuala Krai',5.53,102.20], ['Gerik',5.43,101.13], ['Taiping',4.85,100.74],
    ['Tanah Rata',4.47,101.38], ['Dungun',4.76,103.42], ['Kluang',2.03,103.32],
    ['Muar',2.04,102.57], ['Port Dickson',2.52,101.80], ['Teluk Intan',4.02,101.02],
    ['Kuala Selangor',3.34,101.25], ['Kuala Lipis',4.18,102.05], ['Bentong',3.52,101.91],
    ['Batu Pahat',1.85,102.93], ['Lumut',4.23,100.63], ['Pekan',3.49,103.39],
    ['Jerteh',5.74,102.49], ['Jeli',5.70,101.84], ['Kuala Pilah',2.74,102.25],
    ['Sepang',2.69,101.75], ['KLIA',2.75,101.71], ['Tampin',2.47,102.23],
    ['Kuala Rompin',2.81,103.49], ['Sungai Petani',5.65,100.49], ['Sik',5.82,100.74],
    ['Parit Buntar',5.13,100.49], ['Rawang',3.32,101.58], ['Karak',3.41,102.03],
    ['Kuala Berang',5.07,103.01], ['Kuala Kubu Bharu',3.56,101.66], ['Endau',2.65,103.62],
    ['Baling',5.68,100.92], ['Bahau',2.81,102.41], ['Chukai',4.24,103.42]
  ];
  function condition(code) {
    const night = code.endsWith('_night');
    if (code.includes('thunder')) return ['⛈️','Thunderstorms','Ribut petir'];
    if (code.includes('heavyrain')) return ['🌧️','Heavy rain','Hujan lebat'];
    if (code.includes('lightrain')) return ['🌦️','Light rain','Hujan renyai'];
    if (code.includes('rain')) return ['🌧️','Rain','Hujan'];
    if (code.includes('fog')) return ['🌫️','Fog','Kabus'];
    if (code.startsWith('partlycloudy')) return [night?'☁️':'⛅','Partly cloudy','Separa mendung'];
    if (code.startsWith('fair')) return [night?'🌙':'🌤️','Mostly clear','Kebanyakannya cerah'];
    if (code.startsWith('clearsky')) return [night?'🌙':'☀️','Clear','Cerah'];
    if (code==='cloudy') return ['☁️','Cloudy','Mendung'];
    return null;
  }
  function parse(body, expires, now) {
    const p = body?.properties, issued = Date.parse(p?.meta?.updated_at);
    if (!Number.isFinite(issued) || !Array.isArray(p?.timeseries)) return null;
    const slots = new Map();
    for (const row of p.timeseries) {
      const at = Date.parse(row.time), data = row.data;
      const temp = data?.instant?.details?.air_temperature;
      const code = data?.next_1_hours?.summary?.symbol_code;
      if (Number.isFinite(at) && Number.isFinite(temp) && typeof code === 'string' && condition(code))
        slots.set(at, [code, Math.round(temp)]);
    }
    return slots.size ? {issued, fetched:now, expires:Number.isFinite(expires)?expires:now, slots} : null;
  }
  function slot(forecast, at) {
    if (!forecast || Date.now()-forecast.issued > 24*hour) return null;
    return forecast.slots.get(Math.floor(at/hour)*hour) || null;
  }
  // Only a coarse destination cell goes into a request. Town queries use fixed public points.
  function destinationCell(point) {
    if (!Array.isArray(point) || point.length!==2 || !point.every(Number.isFinite) || point[0]<1.15 || point[0]>6.75 ||
        point[1]<99.5 || point[1]>104.65) return null;
    return point.map(n=>Number((Math.round(n*20)/20).toFixed(2)));
  }
  window.JalanWeatherData = {towns, hour, condition, parse, slot, destinationCell};
})();
