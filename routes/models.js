import { json } from 'itty-router';

const getModels = async env => {
	const url = `https://huggingface.co/models-json?inference=warm&other=endpoints_compatible&sort=trending&withCount=true`;
	const headers = {
	};

	const response = await fetch(url, { headers });

	if (!response.ok) {
		throw new Error(`Failed to fetch models: ${response.statusText}`);
	}

	const responseJson = await response.json();
	return responseJson.models;
};


export const modelsHandler = async (request, env) => {
	const models = await getModels(env);

	const modelList = models.map(model => ({
		id: model.id,
		object: 'model',
		created: Math.floor(new Date(model.lastModified).getTime()/1000),
		owned_by: model.id.split("/")[0],
	}));

	return json({
		object: 'list',
		data: modelList,
	});
};
