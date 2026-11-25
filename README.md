# Rwanda Planting Advisor 🌱

A web-based application that helps Rwandan farmers make more informed planting decisions using weather forecasts and crop suitability estimates.

## 1. Project Overview

### 1.1 About the Project

Rwanda Planting Advisor is a web application designed to help farmers assess whether current and upcoming weather conditions are suitable for planting selected crops in different districts of Rwanda.

Agriculture is an important part of Rwanda's economy and the livelihoods of many households. This project addresses that challenge by combining district-level location data, seven-day weather forecasts, and crop climate suitability information to generate simple planting recommendations. It currently supports four crops and twelve selected districts across Rwanda's provinces.

### 1.2 Project Objectives

- Help farmers understand upcoming weather conditions in their districts.
- Provide preliminary crop suitability estimates using temperature and rainfall.
- Make weather information easier to interpret through simple recommendations.
- Allow users to compare planting conditions across supported districts.
- Provide access to previously saved forecast data when the weather service is temporarily unavailable.

## 2. Features

### 2.1 District Search and Filtering

Users can:
- Search for a supported district.
- Filter districts by province.
- Select a crop to assess its suitability under the forecast conditions.

### 2.2 Crop Suitability Assessment

The application evaluates rainfall and average temperature against the selected crop's configured suitability ranges. Each district receives a suitability score out of 100 when sufficient weather data is available. Results are estimates and should not be interpreted as guaranteed predictions of crop performance.

### 2.3 Sorting

Users can organize results by:
- Best suitability score.
- Worst suitability score.
- District name in alphabetical order.
- District name in reverse alphabetical order.

### 2.4 Seven-Day Weather Forecast

The application retrieves:
- Daily precipitation totals.
- Daily mean temperatures.
- Seven-day forecast information for supported districts.

Users can open a detailed forecast view to examine daily weather conditions.

### 2.5 Offline Fallback

The application saves successfully retrieved weather data in the browser's local storage.

If a new weather request fails because of a network problem or an unavailable API, the application can use a previously saved, structurally valid forecast.

### 2.6 Responsive Interface

The interface adapts to different screen sizes:
- Desktop users see weather suitability information in a table.
- Smaller screens use a card-based layout.
- Forecast details are presented in a modal.

## 3. Technologies Used

* HTML5: Application structure 
* CSS3: Styling and responsive layout 
* JavaScript: Application logic, filtering, scoring, and API integration 
* JSON: Crop and district datasets 
* Open-Meteo API: Weather forecast information 
* Local Storage: Caching forecast data in the browser 
* Ubuntu Server: Hosting environment 
* Nginx: Web server and reverse proxy 

## 4. Data Sources and Methodology

### 4.1 Weather Data: Open-Meteo

The application retrieves weather forecasts from the Open-Meteo Forecast API.

**API documentation:** https://open-meteo.com/en/docs

The application uses the following endpoint: `https://api.open-meteo.com/v1/forecast`

The request includes:

* `latitude`: Coordinates of supported districts 
* `longitude`: Coordinates of supported districts 
* `daily=precipitation_sum`: Daily precipitation totals 
* `daily=temperature_2m_mean`: Daily mean temperatures 
* `forecast_days=7`: Requests a seven-day forecast 
* `timezone=Africa/Kigali`: Uses Rwanda's local timezone 

No API key is required for the standard Open-Meteo API endpoint used by this project.

### 4.2 District Data

District coordinates are stored in `districts.json`.

The current dataset contains twelve selected districts:

* Kigali City | Nyarugenge, Gasabo |
* Southern Province | Huye, Muhanga |
* Northern Province | Musanze, Gicumbi |
* Eastern Province | Nyagatare, Rwamagana, Bugesera |
* Western Province | Rubavu, Karongi, Rusizi |

The coordinates act as reference points for retrieving weather forecasts. They do not represent weather measurements taken at every farm within a district.

### 4.3 Crop Data: FAO EcoCrop

The crop dataset is stored in `crops.json`.

The documented climatic ranges are based on crop information from FAO EcoCrop:

* Maize (*Zea mays*) | https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2175 |
* Beans (*Phaseolus vulgaris*) | https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1668 |
* Irish potatoes (*Solanum tuberosum*) | https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1971 |
* Cassava (*Manihot esculenta*) | https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1420 |

**Important methodological distinction:** FAO EcoCrop provides climatic suitability information, including annual rainfall ranges. It does not establish the weekly rainfall assumptions shown above as universal seven-day crop requirements.

### 4.4 Suitability Scoring Method

The application calculates separate rainfall and temperature scores.

Each condition is evaluated against its configured minimum and maximum values.

- A value inside the configured range receives a score of 50.
- Values outside the range receive progressively lower scores based on their distance from the preferred range.
- The score cannot fall below zero.

The two condition scores are added to produce a total score out of 100.

The application also checks for unusually heavy rainfall. The configured `maxRainExtremeFactor` is `1.5`, meaning rainfall above 1.5 times the crop's configured weekly maximum triggers the extreme-rainfall condition.

## 5. Local Installation and Execution

### 5.1 Prerequisites

Before running the application locally, make sure you have:

- Git installed.
- Python 3 installed (for the local HTTP server).
- A modern web browser.
- An internet connection for retrieving live weather forecasts.

### 5.2 Clone the Repository

Open a terminal and run:

git clone https://github.com/sagelessly/planting_advisor

### 5.3 Run the Application

The application is static and does not require a build process.

You can open `index.html` directly in a browser, but running a local HTTP server is recommended.

Run: python3 -m http.server 8000 and Open the following address in your browser: http://localhost:8000

### 5.4 Project Structure

The main project files are organized as follows:

rwanda-planting-advisor/
│
├── index.html
├── app.js
├── crops.json
├── districts.json
├── styles.css
├── screenshots
└── README.md

## 6. How to Use the Application

1. Open the application in a browser.
2. Wait for the weather forecast to load.
3. Search for a district or select a province.
4. Choose the crop you want to assess.
5. Review the suitability recommendations.
6. Sort results to compare districts.
7. Open a district's forecast details to examine its seven-day weather conditions.
8. Check the cache notice if the application displays previously saved weather information.

### Understanding the Results

- **Good to Plant:** The forecast meets both configured weekly suitability conditions.
- **Take Precautions:** At least one condition is outside the preferred range, but the model does not classify the situation as a reason to wait.
- **Wait:** The model identifies both conditions as unsuitable or detects rainfall above its configured extreme threshold.

## 7. Deployment Architecture

The application is deployed using three Ubuntu servers:

- **Web01:** Hosts the first copy of the application.
- **Web02:** Hosts the second copy of the application.
- **lb01:** Acts as the Nginx reverse proxy and load balancer.

### 7.1 How It Works

1. A user accesses the application through LB01.
2. Nginx on LB01 receives the HTTP request.
3. The request is forwarded to one of the configured backend servers.
4. Web01 or Web02 serves the application files.
5. Nginx uses its default round-robin upstream balancing method to distribute requests between the available backend servers.

Both web servers host the same application files. The load balancer provides a single entry point for users and distributes incoming requests across the two web servers.

### 8 Screenshots and Evidence

The following are the tests to the repository found in /screenshots:

* Application homepage: Application successfully loads
* District and crop selection: Search and filtering functionality
* Suitability results: Crop suitability recommendations
* Forecast details: Seven-day weather forecast 
* Web01 curl response: Web01 returns HTTP 200 and its identity 
* Web02 curl response: Web02 returns HTTP 200 and its identity 
* Load-balancer test: Requests reach both backend servers

## 9. Challenges and Solutions

### 9.1 Comparing Annual Crop Rainfall Requirements with Weekly Forecasts

**Challenge:**

The crop reference dataset provides annual rainfall ranges, while the application retrieves a seven-day weather forecast. Directly comparing annual rainfall requirements with seven-day precipitation would produce misleading results.

**Solution:**

The application separates documented annual climatic suitability ranges from application-defined weekly rainfall heuristics. This makes it possible to assess the forecast while clearly documenting that weekly thresholds are assumptions rather than established FAO weekly requirements.

### 9.2 Handling API and Network Failures

**Challenge:**

The application depends on an external weather API. Network interruptions, request timeouts, API errors, or rate limits can prevent fresh weather data from loading.

**Solution:**

The application uses request timeouts, response validation, error handling, and browser local storage. When a request fails, it checks for a previously saved and structurally valid forecast and displays a notice if cached data is being used.

### 9.3 Nginx Port Conflict on LB01

**Challenge:**

When starting Nginx on LB01, the service failed because port 80 was already occupied.
The error indicated that Nginx could not bind to `0.0.0.0:80`.

**Solution:**

The listening process was identified using: sudo ss -ltnp | grep ':80' The investigation identified HAProxy as the process occupying port 80. The conflicting service was stopped so that Nginx could use the required port. Nginx was then started and its status verified.

## 10. Limitations

### 10.1 Limited District Coverage

The current application supports twelve selected districts rather than all thirty districts in Rwanda.

### 10.2 Forecast Resolution

Weather forecasts are based on district reference coordinates. Conditions at a specific farm may differ from the forecast at the selected reference point.

### 10.3 Forecast Uncertainty

Weather forecasts are estimates and can change. Rainfall and temperature conditions may differ from the forecast.

### 10.4 Simplified Crop Suitability Model

The current model evaluates temperature and rainfall. It does not fully account for:

- Soil type and fertility.
- Soil moisture and drainage.
- Crop growth stage.
- Evapotranspiration.
- Planting dates.
- Seed varieties.
- Pests and diseases.
- Local agricultural practices.

### 10.5 Heuristic Weekly Rainfall Thresholds

The weekly rainfall thresholds are application-defined assumptions. They are not direct conversions of FAO annual rainfall ranges into scientifically established weekly crop requirements.

## 11. Credits

This project uses the following external resources:

- **Open-Meteo:** Weather forecast API — https://open-meteo.com/
- **FAO EcoCrop:** Crop climatic suitability information — https://ecocrop.apps.fao.org/

## Project Links

* GitHub Repository: `https://github.com/sagelessly/planting_advisor` 
* Deployed Application: `http://18.171.134.226/` 
* Demonstration Video: `https://youtu.be/mt9ypySwPbw` 

## Final Note

Rwanda Planting Advisor is intended to make weather information more accessible and understandable for farmers. Farmers should combine the application's results with local conditions, agricultural experience, and guidance from qualified agricultural extension officers.
