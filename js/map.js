const GEOFILE = "data/USA.json";
const DATAFILE = "data/weather.csv";

const STATE_TO_FIPS = {
  AL: "US01",
  AK: "US02",
  AZ: "US04",
  AR: "US05",
  CA: "US06",
  CO: "US08",
  CT: "US09",
  DE: "US10",
  DC: "US11",
  FL: "US12",
  GA: "US13",
  HI: "US15",
  ID: "US16",
  IL: "US17",
  IN: "US18",
  IA: "US19",
  KS: "US20",
  KY: "US21",
  LA: "US22",
  ME: "US23",
  MD: "US24",
  MA: "US25",
  MI: "US26",
  MN: "US27",
  MS: "US28",
  MO: "US29",
  MT: "US30",
  NE: "US31",
  NV: "US32",
  NH: "US33",
  NJ: "US34",
  NM: "US35",
  NY: "US36",
  NC: "US37",
  ND: "US38",
  OH: "US39",
  OK: "US40",
  OR: "US41",
  PA: "US42",
  RI: "US44",
  SC: "US45",
  SD: "US46",
  TN: "US47",
  TX: "US48",
  UT: "US49",
  VT: "US50",
  VA: "US51",
  WA: "US53",
  WV: "US54",
  WI: "US55",
  WY: "US56",
};

// opposite dir to send info to line chart
const FIPS_TO_STATE = Object.fromEntries(
  Object.entries(STATE_TO_FIPS).map(([k, v]) => [v, k]),
);

const metricSelect = document.getElementById("feature-select");

const tooltip = d3.select("body").append("div").attr("class", "tooltip");

// map instance
const map = d3
  .choropleth()
  .geofile(GEOFILE)
  .projection(d3.geoAlbersUsa)
  .unitId("fips") // data rows must have .fips
  .column("value") // data rows must have .value
  //   .scale(1000)
  .legend(true)
  .postUpdate(function () {
    // runs after map is drawn, kill the <title> element tooltip
    d3.selectAll(".d3-geomap title").remove();

    // paint map exactly when it's done building
    if (updateMapColors) {
      updateMapColors();
    }
  });

let RAW = [];
let dataByDate = new Map();
let currentValues = new Map(); // to store FIPS -> current value
let isMapInitialized = false;
let lastMetric = null;
let selectedMapFips = "US24"; // starts w/maryland highlighted (FIPS 24)
let updateMapColors = null;

let selectedDate = new Date(2017, 0, 1);
window.updateMapForDate = function (d) {
  selectedDate = d;
  draw();
};

d3.csv(DATAFILE)
  .then((rows) => {
    RAW = rows;
    console.log("CSV columns:", rows.columns);
    console.log("First row:", rows[0]);

    // If the CSV has one of the metric options, auto-pick it
    const cols = rows.columns || Object.keys(rows[0] || {});
    const preferred = ["TAVG", "TMAX", "TMIN", "PRCP", "value"];
    const found = preferred.find((c) => cols.includes(c));
    if (found) metricSelect.value = found;

    const parseDate = d3.timeParse("%Y%m%d");
    const cutoffDate = new Date(2017, 8, 20).getTime(); // don't use data here and after
    rows.forEach((r) => {
      r._date = parseDate(r.date);

      // pre calculate time, group immediately
      if (r._date && r._date.getTime() < cutoffDate) {
        const ms = d3.timeDay.floor(r._date).getTime();
        if (!dataByDate.has(ms)) {
          dataByDate.set(ms, []);
        }
        dataByDate.get(ms).push(r);
      }
    });

    draw();
  })
  .catch((err) => {
    console.error("Could not load CSV:", err);
    alert(
      "CSV failed to load. Are you running Live Server? And is data/weather.csv in the right place?",
    );
  });

metricSelect.addEventListener("change", draw);

function draw() {
  // ensure we don't draw on an empty dataset
  if (RAW.length === 0) {
    return;
  }
  const metric = metricSelect.value;

  // converts RAW rows into {fips, value} aggregated per state
  const stateAgg = new Map(); // fips -> {sum, count}

  const targetMs = selectedDate
    ? d3.timeDay.floor(selectedDate).getTime()
    : null;

  // get only the rows for today
  const dailyRows = targetMs ? dataByDate.get(targetMs) || [] : RAW;

  // for (const r of RAW) {
  for (const r of dailyRows) {
    if (!r._date) continue;
    if (targetMs !== null && d3.timeDay.floor(r._date).getTime() !== targetMs)
      continue;

    const fips = getFips(r);
    if (!fips) continue;

    const v = +r[metric];
    if (Number.isNaN(v)) continue;

    const cur = stateAgg.get(fips) || { sum: 0, count: 0 };
    cur.sum += v;
    cur.count += 1;
    stateAgg.set(fips, cur);
  }

  // reset old currentValues map
  currentValues.clear();

  const choroplethData = Array.from(stateAgg, ([fips, s]) => {
    const calculatedValue = s.count ? s.sum / s.count : null;

    // add to global lookup map
    currentValues.set(fips, calculatedValue);

    return {
      fips,
      value: calculatedValue,
    };
  });

  // save paintMap function to the global variable
  updateMapColors = paintMap; 

  // rebuild the map if it's the first load or the dropdown was changed
  if (!isMapInitialized || lastMetric !== metric) {
    d3.select("#map").selectAll("*").remove();
    map.draw(d3.select("#map").datum(choroplethData));
    isMapInitialized = true;
    lastMetric = metric;
  } else {
    paintMap();
  }
  function paintMap() {
    // slider is the only thing that moved, so transition colors only
    const values = choroplethData.map((d) => d.value).filter((v) => v !== null);
    const min = d3.min(values) || 0;
    const max = d3.max(values) || 100;

    // create color scale
    const colorScale = d3
      .scaleSequential(d3.interpolateYlOrRd)
      .domain([min, max]);

    d3.select("#map")
      .selectAll(".unit")
      .interrupt() // stop d3-geomap default color rendering
      .transition()
      .duration(10) // extremely quick transition for dragging
      .style("fill", function () {
        const geo = d3.select(this).datum();
        const fips = geo?.properties?.fips || geo?.id;
        const val = currentValues.get(fips);
        return val !== null && val !== undefined ? colorScale(val) : "#e0e0e0";
      });

    // preserve highlighting during redraws
    if (selectedMapFips) {
      d3.selectAll(".unit")
        .filter(function (d) {
          const fips = d?.properties?.fips || d?.id;
          return fips === selectedMapFips;
        })
        .classed("selected-state", true)
        .raise();
    }
  }

  // debug if we accidentally have no join keys / no numeric metric values
  if (choroplethData.length === 0) {
    console.warn(
      "No choropleth data rows produced. Likely: missing fips/state column, or metric not numeric.",
    );
  }
}

function getFips(row) {
  const directFips = pick(row, ["fips", "FIPS"]);
  if (directFips && String(directFips).startsWith("US"))
    return String(directFips).trim();

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

// !!! new code to enable works with chart
const mapContainer = document.getElementById("map");

// tooltip hover

mapContainer.addEventListener("mousemove", (event) => {
  const unit = event.target.closest(".unit");
  if (unit) {
    const geo = d3.select(unit).datum();
    const name = geo?.properties?.name ?? "State";
    const metric = metricSelect.value;

    // get display value for tooltip
    const fips = geo?.properties?.fips;
    let displayValue = "No data";
    if (fips && currentValues.has(fips)) {
      const rawValue = currentValues.get(fips);
      // format to 2 dec. places
      displayValue = rawValue !== null ? rawValue.toFixed(2) : "N/A";
    }

    tooltip
      .style("opacity", 1)
      .style("left", event.pageX + 10 + "px")
      .style("top", event.pageY + 10 + "px")
      .html(`<strong>${name}</strong><br/>${metric}: ${displayValue}`);

    event.stopPropagation();
    event.preventDefault();
  } else {
    tooltip.style("opacity", 0);
  }
});

// tooltip hiding
mapContainer.addEventListener("mouseout", (event) => {
  if (!event.target.closest(".unit")) {
    tooltip.style("opacity", 0);
  }
});

//map event listener: kill zoom + get state + update line chart
mapContainer.addEventListener(
  "click",
  (event) => {
    const unit = event.target.closest(".unit");
    if (unit) {
      // kill map zoom
      event.stopPropagation();
      event.preventDefault();

      // get selected state, info
      const clickedD3Node = d3.select(unit);
      const geo = clickedD3Node.datum();
      const fipsCode = geo?.properties?.fips;

      selectedMapFips = fipsCode; // update global FIPS code

      // remove highlight from all states, add it to the clicked one
      d3.selectAll(".unit").classed("selected-state", false);
      clickedD3Node.classed("selected-state", true).raise();

      const stateAbbr = FIPS_TO_STATE[fipsCode];

      if (stateAbbr && window.updateChartFromMap) {
        window.updateChartFromMap(stateAbbr);
      }
    }
  },
  true,
); // third arg true means capture event immediately (before default d3 behavior)
// ensures that click logic works
