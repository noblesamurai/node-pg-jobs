FROM node:0.12
RUN apt-get update && apt-get install -y netcat
ADD ./package.json /code/package.json
WORKDIR /code
RUN npm install
ADD . /code
CMD [ "sh", "./start.sh" ]
