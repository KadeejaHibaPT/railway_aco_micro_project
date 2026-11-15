# Railway ACO Route and Resource Assignment

A standalone Computational Intelligence micro-project using Ant Colony Optimization (ACO) to select train routes and assign destination platforms and qualified crews.

## Run

Open `index.html` in a modern browser, or open this folder in VS Code and run `python -m http.server 8000`, then visit `http://localhost:8000`. No packages or external data are required. Google Fonts are optional; system fallbacks are included.

## Use the simulator

1. Set ant count, iterations, α, β, ρ, and random seed.
2. Close a track to simulate an unavailable connection.
3. Expand **Edit train schedule** to add/remove trains and set their origin, destination, service type, departure, and platform dwell.
4. Expand **Configure platforms and crews** to change platform counts station by station or mark crew teams off duty.
5. Click **Optimize railway plan**. Compare the route/resource plan with the shortest-route, first-available baseline.
6. Save the scenario in the browser, load it later, or restore defaults. Export the assignment table as CSV.

## ACO model

- Stations are graph nodes; tracks are edges with travel-time costs adjusted by a synthetic traffic factor.
- For each train, ants construct a route using track pheromone and inverse travel cost.
- They assign a destination platform, checking whether its arrival/dwell window conflicts with another train.
- They select a crew team qualified for the service type and check shift coverage and overlapping duties.
- Pheromone evaporates by ρ; elite ant plans deposit pheromone on their chosen tracks, platforms, and crew assignments in inverse proportion to plan cost.
- The objective sums travel time and adds penalties for platform conflicts, unavailable or unqualified staff, and missing routes.
- The baseline uses the shortest available track route and the first available platform and qualified crew.

The dataset is deliberately small and synthetic (five stations, six default trains, two platforms per station, and five crews). The scenario editor supports up to 20 trains and 1-6 platforms at each station. It is for coursework demonstrations only and does not model a live railway, full timetable constraints, safety rules, or real staff regulations.
