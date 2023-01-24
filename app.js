const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
};
initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const statesListDbToResponse = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const districtListDbToResponse = (dbObject) => ({
  districtId: dbObject.district_id,
  districtName: dbObject.district_name,
  stateId: dbObject.state_id,
  cases: dbObject.cases,
  cured: dbObject.cured,
  active: dbObject.active,
  deaths: dbObject.deaths,
});

//Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Get list of all states API

app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT
      *
    FROM
      state;`;
  const statesArray = await db.all(getStatesQuery);
  response.send(
    statesArray.map((eachState) => statesListDbToResponse(eachState))
  );
});

//Get details of a state API

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const stateDetailsQuery = `
    SELECT * FROM state 
    WHERE state_id = ${stateId}
    `;
  const dBResponse = await db.get(stateDetailsQuery);
  const stateDetails = statesListDbToResponse(dBResponse);
  response.send(stateDetails);
});

//create a district API

app.post("/districts/", authenticateToken, async (request, response) => {
  const districtDetails = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;
  const createDistrictQuery = `
    INSERT INTO district (district_name,state_id,cases,cured,active,deaths)
    VALUES ('${districtName}',${stateId},${cases},${cured},${active},${deaths})
    `;

  const dbResponse = await db.run(createDistrictQuery);
  const districtId = dbResponse.lastID;
  response.send(`District Successfully Added`);
});

//Get details of a district API

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetailsQuery = `
    SELECT * FROM district 
    WHERE district_id = ${districtId}
    `;
    const dBResponse = await db.get(districtDetailsQuery);
    const districtDetails = districtListDbToResponse(dBResponse);
    response.send(districtDetails);
  }
);

//Delete a specific district

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
  DELETE FROM district WHERE district_id = ${districtId}
  `;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//Update a district details API

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;
    const updateDistrictQuery = `
  UPDATE district SET 
  district_name = '${districtName}',
  state_id = ${stateId},
  cases = ${cases},
  cured = ${cured},
  active = ${active},
  deaths = ${deaths}
  WHERE district_id = ${districtId}
  `;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

//Get stats API
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    console.log(stateId);
    const getStatsQuery = `
    SELECT SUM(cases) AS totalCases, SUM(cured) AS totalCured, 
    SUM(active) AS totalActive, SUM(deaths) AS totalDeaths
    FROM district
    WHERE state_id = ${stateId}
    `;
    const dbStats = await db.all(getStatsQuery);
    const formattedDbStats = {
      totalCases: dbStats[0].totalCases,
      totalCured: dbStats[0].totalCured,
      totalActive: dbStats[0].totalActive,
      totalDeaths: dbStats[0].totalDeaths,
    };
    response.send(formattedDbStats);
  }
);

module.exports = app;
