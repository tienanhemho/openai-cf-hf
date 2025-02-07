export const transcriptionHandler = async (request, env) => {
	let model = 'openai/whisper-large-v3-turbo';
	let error = null;
	// don't need anything else as openai just gives back text
	console.log(request.headers.get('Content-Type'));
	try {
		if (request.headers.get('Content-Type').includes('multipart/form-data')) {
			const formData = await request.formData();
			const audio = formData.get('file');
			if (!audio) {
				return Response.json({ error: 'no audi`o provided' }, { status: 400 });
			}
			const blob = await audio.arrayBuffer();

			//request to hugging face api
			const url = `https://api-inference.huggingface.co/models/${model}`;
			const headers = {
				"authorization": "Bearer " + env.HUGGING_FACE_ACCESS_TOKEN,
    			"content-type": "application/json",
			};

			const response = await fetch(url, { headers, "method": "POST", body: blob});

			if (!response.ok) {
				throw new Error(`Failed to fetch models: ${response.statusText}`);
			}
			const responseJson = await response.json();

			return Response.json({
				text: responseJson.text,
			});
		}
	} catch (e) {
		error = e;
	}

	// if there is no header or it's not json, return an error
	if (error) {
		return Response.json({ error: error.message }, { status: 400 });
	}

	// if we get here, return a 400 error
	return Response.json({ error: 'invalid request' }, { status: 400 });
};

function getLanguageId(text) {
	text = text.toLowerCase();
	if (text.includes('\n')) {
		return text.split('\n')[0];
	} else if (text.includes(' ')) {
		return text.split(' ')[0];
	} else {
		return text;
	}
}

export const translationHandler = async (request, env) => {
	let model = 'openai/whisper-large-v3-turbo';
	let error = null;

	try {
		if (request.headers.get('Content-Type').includes('multipart/form-data')) {
			const formData = await request.formData();
			const audio = formData.get('file');
			if (!audio) {
				throw new Error('no audio provided');
			}
			const blob = await audio.arrayBuffer();
			//request to hugging face api
			const url = `https://api-inference.huggingface.co/models/${model}`;
			const headers = {
				"authorization": "Bearer " + env.HUGGING_FACE_ACCESS_TOKEN,
				"content-type": "application/json",
			};

			const response = await fetch(url, { headers, "method": "POST", body: blob});

			if (!response.ok) {
				throw new Error(`Failed to fetch models: ${response.statusText}`);
			}
			const responseJson = await response.json();

			const response_lang_id = await fetch(`https://api-inference.huggingface.co/models/meta-llama/Llama-3.1-8B-Instruct/v1/chat/completions`, { headers, "method": "POST", body: JSON.stringify({
				max_tokens: json.max_tokens ?? 2048,
				stream: json.stream ?? false,
				temperature: Number(Number(json.temperature ?? 0.5).toFixed(1)),
				top_p: json.top_p ?  (json.top_p >= 1 ? 0.9 : (json.top_p <= 0 ? 0.1 : json.top_p)) : 0.7,
				messages: [
					{
						role: 'user',
						content:
							"Output one of the following: english, chinese, french, spanish, arabic, russian, german, japanese, portuguese, hindi. Identify the following languages.\nQ:'Hola mi nombre es brian y el tuyo?'",
					},
					{ role: 'assistant', content: 'spanish' },
					{ role: 'user', content: 'Was für ein schönes Baby!' },
					{ role: 'assistant', content: 'german' },
					{ role: 'user', content: responseJson.text },
				],
			}) });

			if (!response.ok) {
				throw new Error(`Failed to fetch models: ${response.statusText}`);
			}

			const responseJson_lang_id = await response_lang_id.json();

			const translation_resp = await fetch(`https://api-inference.huggingface.co/models/google-t5/t5-base`, { headers, "method": "POST", body: JSON.stringify({
				input: resp.text,
				parameters: {
					src_lang: getLanguageId(responseJson_lang_id.choices && responseJson_lang_id.choices[0].message.content ? responseJson_lang_id.choices[0].message.content : 'unknow'),
					tgt_lang: 'english',
					clean_up_tokenization_spaces: true
				}
			}) });

			const translation_resp_json = await translation_resp.json();

			if (!translation_resp_json.translated_text) {
				console.log({ translation_resp_json });
				throw new Error('translation failed');
			}

			return Response.json({
				text: translation_resp_json.translated_text,
			});
		}
	} catch (e) {
		error = e;
	}

	// if there is no header or it's not json, return an error
	if (error) {
		return Response.json({ error: error.message }, { status: 400 });
	}

	// if we get here, return a 400 error
	return Response.json({ error: 'invalid request' }, { status: 400 });
};
