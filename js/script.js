const GEOFILE = "data/USA.json";
const DATAFILE = "data/weather.csv";

const STATE_TO_FIPS = {
  AL:"US01", AK:"US02", AZ:"US04", AR:"US05", CA:"US06", CO:"US08", CT:"US09",
  DE:"US10", DC:"US11", FL:"US12", GA:"US13", HI:"US15", ID:"US16", IL:"US17",
  IN:"US18", IA:"US19", KS:"US20", KY:"US21", LA:"US22", ME:"US23", MD:"US24",
  MA:"US25", MI:"US26", MN:"US27", MS:"US28", MO:"US29", MT:"US30", NE:"US31",
  NV:"US32", NH:"US33", NJ:"US34", NM:"US35", NY:"US36", NC:"US37", ND:"US38",
  OH:"US39", OK:"US40", OR:"US41", PA:"US42", RI:"US44", SC:"US45", SD:"US46",
  TN:"US47", TX:"US48", UT:"US49", VT:"US50", VA:"US51", WA:"US53", WV:"US54",
  WI:"US55", WY:"US56"
};

const metricSelect = document.getElementById("metric"); 
const aggSelect = document.getElementById("agg"); 

const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip"); 

// map instance
const map = d3.choropleth()
  .geofile(GEOFILE)
  .projection(d3.geoAlbersUsa)
  .unitId("fips")     // data rows must have .fips
  .column("value")    // data rows must have .value
  .scale(1000)
  .legend(true);

let RAW = []

d3.csv(DATAFILE).then(rows => {
    RAW = rows;
    console.log("CSV columns:", rows.columns);
    console.log("First row:", rows[0]);

    // If the CSV has one of the metric options, auto-pick it
    const cols = rows.columns || Object.keys(rows[0] || {});
    const preferred = ["TAVG", "TMAX", "TMIN", "PRCP", "value"];
    const found = preferred.find(c => cols.includes(c));
    if (found) metricSelect.value = found;

    draw();
}).catch(err => {
    console.error("Could not load CSV:", err);
    alert("CSV failed to load. Are you running Live Server? And is data/weather.csv in the right place?");
});

metricSelect.addEventListener("change", draw); 
aggSelect.addEventListener("change", draw);

function draw() {
  const metric = metricSelect.value;
  const agg = aggSelect.value;

  // converts RAW rows into {fips, value} aggregated per state
  const stateAgg = new Map(); // fips -> {sum, count}

  for (const r of RAW) {
    const fips = getFips(r);
    if (!fips) continue;

    const v = +r[metric];
    if (Number.isNaN(v)) continue;

    const cur = stateAgg.get(fips) || { sum: 0, count: 0 };
    cur.sum += v;
    cur.count += 1;
    stateAgg.set(fips, cur);
  }

  const choroplethData = Array.from(stateAgg, ([fips, s]) => ({
    fips,
    value: agg === "sum" ? s.sum : (s.count ? s.sum / s.count : null)
  }));

  // clears previous map so that it doesn't multi-populate
  d3.select("#map").selectAll("*").remove();


  // draws map (clears + re-renders inside #map)
  map.draw(d3.select("#map").datum(choroplethData));

  // adds interactions to the rendered state paths
  // d3-geomap uses class "unit" for polygons
  d3.select("#map").selectAll(".unit")
    .on("mousemove", function () {
      const geo = d3.select(this).datum();
      const name = geo?.properties?.name ?? "State";

      tooltip
        .style("opacity", 1)
        .style("left", (d3.event.pageX + 10) + "px")
        .style("top", (d3.event.pageY + 10) + "px")
        .html(`<strong>${name}</strong><br/>Metric: ${metric}`);
    })
    .on("mouseout", () => tooltip.style("opacity", 0))
    .on("click", function () {
      const geo = d3.select(this).datum();
      const name = geo?.properties?.name ?? "State";
      console.log("Clicked:", name, "| metric:", metric);
    });

  // debug if we accidentally have no join keys / no numeric metric values
  if (choroplethData.length === 0) {
    console.warn("No choropleth data rows produced. Likely: missing fips/state column, or metric not numeric.");
  }
}

function getFips(row){
    const directFips = pick(row, ["fips", "FIPS"]); 
    if (directFips && String(directFips).startsWith("US")) return String(directFips).trim();

    const abbr = pick(row, ["state", "STATE", "abbr", "ABBR", "State"]);
    if (abbr) {
        const key = String(abbr).trim().toUpperCase();
        if (STATE_TO_FIPS[key]) return STATE_TO_FIPS[key];
    }

    return null; 
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return null;
}