# Use the pre-built Docker Hub image
FROM shaikeme/ha-mcp-server:latest

# Install bashio for Home Assistant add-on integration
RUN apk add --no-cache bash curl jq

# Copy the run script
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]