import { uint8ArrayToBase64 } from '../utils/converters';
import { uuidv4 } from '../utils/uuid';
import { streamToBuffer } from '../utils/stream';

export const imageGenerationHandler = async (request, env) => {
    let model = 'stabilityai/stable-diffusion-3.5-large';
    let format = 'url';
    let error = null;
    let created = Math.floor(Date.now() / 1000);
    try {
        if (request.headers.get('Content-Type') === 'application/json') {
            let json = await request.json();
            if (!json?.prompt) {
                throw new Error('no prompt provided');
            }
            if (json?.format) {
                format = json.format;
                if (format !== 'b64_json' && format !== 'url') {
                    throw new Error('invalid format. must be b64_json or url');
                }
            }

            const inputs = {
                inputs: json.prompt,
            };

            //request to hugging face api
			const url = `https://api-inference.huggingface.co/models/${model}`;
			const headers = {
				"authorization": "Bearer " + env.HUGGING_FACE_ACCESS_TOKEN,
    			"content-type": "application/json",
			};

			const response = await fetch(url, { headers, "method": "POST", body: inputs });

			if (!response.ok) {
				throw new Error(`Failed to fetch models: ${response.statusText}`);
			}


            // Retrieve its body as ReadableStream
            const body = response.body;

            const reader = body.getReader();
            const respBuffer = await streamToBuffer(reader); // Buffer the stream into memory

            if (format === 'b64_json') {
                const b64_json = uint8ArrayToBase64(respBuffer);
                return new Response(JSON.stringify({
                    data: [{ b64_json }],
                    created,
                }), {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            } else {
                const name = uuidv4() + '.png';
                await env.IMAGE_BUCKET.put(name, respBuffer);
                // the url is https:// + request url origin + /images/get/ + name
                const urlObj = new URL(request.url);
                const url = urlObj.origin + '/v1/images/get/' + name;
                return new Response(JSON.stringify({
                    data: [{ url }],
                    created,
                }), {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            }
        }
    } catch (e) {
        error = e;
    }

    // if there is no header or it's not json, return an error
    if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    // if we get here, return a 400 error
    return new Response(JSON.stringify({ error: 'invalid request' }), {
        status: 400,
        headers: {
            'Content-Type': 'application/json'
        }
    });
};

export const getImageHandler = async (request, env) => {
	const { params } = request;
	const { name } = params;
	if (!name) {
		return new Response(null, {
			status: 404,
		});
	}
	const image = await env.IMAGE_BUCKET.get(name);
	if (!image) {
		return new Response(null, {
			status: 404,
		});
	}
	return new Response(image.body, {
		headers: {
			'Content-Type': 'image/png',
		},
	});
};
