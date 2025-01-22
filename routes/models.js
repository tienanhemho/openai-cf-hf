import { json } from 'itty-router';

const getModels = async env => {
	const url = `https://huggingface-inference-playground.hf.space/`;
	const headers = {
	};

	const response = await fetch(url, { headers });

	if (!response.ok) {
		throw new Error(`Failed to fetch models: ${response.statusText}`);
	}

	const bodyText = await response.text();
	const json  = getJSONfromContent(bodyText, "models:");
	let data = JSON.parse(json);
	if (data.length < 2 || !Array.isArray(data[1].data?.models)) return [];
	return data[1].data.models;
};
function getJSONfromContent(content, afterString = "") {
    content = content.substring(content.indexOf(afterString) + afterString.length);
    if (content === "") return "";
    let json = "";
    let countBracket = 0;
    for (let i = 0; i < content.length; i++) {
        if (content[i] === '{') {
            countBracket++;
        }
        if (content[i] === '}') {
            countBracket--;
        }
        json += content[i];
        if (countBracket === 0) {
            break;
        }
    }
    return json;
}


export const modelsHandler = async (request, env) => {
	const models = await getModels(env);

	const modelList = models.map(model => ({
		id: model.id,
		object: 'model',
		created: Math.floor(new Date(model.createdAt).getTime()/1000),
		owned_by: model.id.split("/")[0],
	}));

	return json({
		object: 'list',
		data: modelList,
	});
};
