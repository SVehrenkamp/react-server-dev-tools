export async function startNextLikeDev(marker) {
  console.info("[custom-wrapper] initializing next-like runtime", { marker });

  const response = await fetch("https://jsonplaceholder.typicode.com/todos/1", {
    headers: {
      "x-custom-wrapper-marker": marker,
    },
    cache: "no-store",
  });

  const json = await response.json();
  console.log("[custom-wrapper] next-like runtime ready", {
    marker,
    status: response.status,
    title: json.title,
  });
}
