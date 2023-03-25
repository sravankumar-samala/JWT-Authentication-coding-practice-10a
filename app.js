const express = require("express");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3");
const path = require("path");
const { open } = require("sqlite");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db;
const secret_token = "awDEklIE_dselOOne_serc";

(async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server started at port: 3000");
    });
  } catch (error) {
    console.log(error.message);
  }
})();

// Utility object conversion functions
const convertStatePromToRespObj = (obj) => {
  return {
    stateId: obj.state_id,
    stateName: obj.state_name,
    population: obj.population,
  };
};

const convertDistPromToRespObj = (obj) => {
  return {
    districtId: obj.district_id,
    districtName: obj.district_name,
    stateId: obj.state_id,
    cases: obj.cases,
    cured: obj.cured,
    active: obj.active,
    deaths: obj.deaths,
  };
};

// Token Authentication Middleware function
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  let jwtToken;
  if (authHeader) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (!jwtToken) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, secret_token, async (error, payload) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        req.username = payload.username;
        next();
      }
    });
  }
};

app.post("/login/", async (req, res) => {
  try {
    const { username, password } = req.body;

    // check if user already exists
    const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const userFound = await db.get(getUserQuery);

    if (!userFound) {
      res.status(400);
      res.send("Invalid user");
    } else {
      const checkPassword = await bcrypt.compare(password, userFound.password);
      if (!checkPassword) {
        res.status(400);
        res.send("Invalid password");
      } else {
        const payload = { username: username };
        const jwtToken = jwt.sign(payload, secret_token);
        res.send({ jwtToken });
      }
    }
  } catch (error) {
    console.log(error.message);
  }
});

// Getting all the states from state table
app.get("/states/", authenticateToken, async (req, res) => {
  const getStatesQuery = `
  SELECT * FROM state ORDER BY state_id;`;
  const statesArr = await db.all(getStatesQuery);
  const newStatesArr = statesArr.map((obj) => convertStatePromToRespObj(obj));
  res.send(newStatesArr);
});

// Getting states based on stateId
app.get("/states/:Id", authenticateToken, async (req, res) => {
  const stateId = req.params.Id;
  const getStatesQuery = `
  SELECT * FROM state WHERE state_id = ${stateId} ORDER BY state_id;`;
  const stateObj = await db.get(getStatesQuery);
  [stateObj].forEach((obj) => res.send(convertStatePromToRespObj(obj)));
});

// Creating new district obj using post method
app.post("/districts/", authenticateToken, async (req, res) => {
  const { districtName, stateId, cases, cured, active, deaths } = req.body;
  const getDistrictQuery = `SELECT * FROM district WHERE district_name = '${districtName}';`;
  const districtFound = await db.get(getDistrictQuery);

  if (!districtFound) {
    const addDistrictQuery = `INSERT INTO district
        (district_name, state_id, cases, cured, active, deaths)
        VALUES ('${districtName}',
                '${stateId}',
                '${cases}',
                '${cured}',
                '${active}',
                '${deaths}');`;
    await db.run(addDistrictQuery);
    //   res.send(`District Successfully Added name: ${districtName}`);
    res.send("District Successfully Added");
  } else {
    res.status(400);
    res.send("District already exists..");
  }
});

// Get district based on district Id
app.get("/districts/:distId", authenticateToken, async (req, res) => {
  const districtId = req.params.distId;
  const getDistQuery = `SELECT * FROM district WHERE district_id = ${districtId};`;
  const distObj = await db.get(getDistQuery);
  if (distObj) {
    [distObj].forEach((obj) => res.send(convertDistPromToRespObj(obj)));
  } else {
    res.send("No such districts found!");
  }
});

// Delete district based on district Id
app.delete("/districts/:distId/", authenticateToken, async (req, res) => {
  const districtId = req.params.distId;
  const deleteDistQuery = `DELETE FROM district WHERE district_id = ${districtId};`;
  await db.run(deleteDistQuery);
  res.send("District Removed");
});

// Updating district details using distId
app.put("/districts/:distId", authenticateToken, async (req, res) => {
  try {
    const districtId = req.params.distId;
    const { districtName, stateId, cases, cured, active, deaths } = req.body;
    const updateDistQuery = `UPDATE district SET district_name = ?,
                                                 state_id = ?,
                                                 cases = ?,
                                                 cured = ?,
                                                 active = ?,
                                                 deaths = ?
                             WHERE district_id = ?;`;
    await db.run(updateDistQuery, [
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
      districtId,
    ]);
    res.send("District Details Updated");
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
});

// {
//   "totalCases": 724355,
//   "totalCured": 615324,
//   "totalActive": 99254,
//   "totalDeaths": 9777
// }

app.get("/states/:stateId/stats/", authenticateToken, async (req, res) => {
  const { stateId } = req.params;
  const getStatsQuery = `
    SELECT SUM(cases) AS totalCases,
    SUM(cured) AS totalCured,
    SUM(active) AS totalActive,
    SUM(deaths) AS totalDeaths 
    FROM state JOIN district ON state.state_id = district.state_id 
    WHERE state.state_id = ${stateId};`;

  const stats = await db.get(getStatsQuery);
  res.send([stats][0]);
});

// exporting app method
module.exports = app;
