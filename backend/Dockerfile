FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY QmsBackend.slnx ./
COPY Qms.API/Qms.API.csproj Qms.API/
COPY Qms.Core/Qms.Core.csproj Qms.Core/
COPY Qms.Infrastructure/Qms.Infrastructure.csproj Qms.Infrastructure/
COPY Qms.Services/Qms.Services.csproj Qms.Services/

RUN dotnet restore Qms.API/Qms.API.csproj

COPY . .
RUN dotnet publish Qms.API/Qms.API.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:5000
EXPOSE 5000

ENTRYPOINT ["dotnet", "Qms.API.dll"]
