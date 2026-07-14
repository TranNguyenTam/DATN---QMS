using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Qms.Core.Exceptions;

namespace Qms.Infrastructure.Utils;

public interface IDatabaseHelper
{
    Task<IEnumerable<dynamic>> ListAsync(string sql, object? parameters = null);
    Task<dynamic?> OneAsync(string sql, object? parameters = null);
    Task<IEnumerable<T>> ListAsync<T>(string sql, object? parameters = null);
    Task<T?> OneAsync<T>(string sql, object? parameters = null);
    Task<int> ExecuteAsync(string sql, object? parameters = null);
    Task<T?> ScalarAsync<T>(string sql, object? parameters = null);
}

public class DatabaseHelper : IDatabaseHelper
{
    private readonly string _connectionString;
    private readonly ILogger<DatabaseHelper> _logger;

    public DatabaseHelper(IConfiguration configuration, ILogger<DatabaseHelper> logger)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection") 
            ?? throw new InvalidOperationException("DefaultConnection not found.");
        _logger = logger;
    }

    public async Task<IEnumerable<dynamic>> ListAsync(string sql, object? parameters = null)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryAsync(sql, parameters);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing ListAsync: {Sql}", sql);
            throw new AppException(ErrorCode.DATABASE_ERROR, "Lỗi truy vấn cơ sở dữ liệu.");
        }
    }

    public async Task<dynamic?> OneAsync(string sql, object? parameters = null)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryFirstOrDefaultAsync(sql, parameters);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing OneAsync: {Sql}", sql);
            throw new AppException(ErrorCode.DATABASE_ERROR, "Lỗi truy vấn cơ sở dữ liệu.");
        }
    }

    public async Task<IEnumerable<T>> ListAsync<T>(string sql, object? parameters = null)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryAsync<T>(sql, parameters);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing ListAsync<T>: {Sql}", sql);
            throw new AppException(ErrorCode.DATABASE_ERROR, "Lỗi truy vấn cơ sở dữ liệu.");
        }
    }

    public async Task<T?> OneAsync<T>(string sql, object? parameters = null)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            return await connection.QueryFirstOrDefaultAsync<T>(sql, parameters);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing OneAsync<T>: {Sql}", sql);
            throw new AppException(ErrorCode.DATABASE_ERROR, "Lỗi truy vấn cơ sở dữ liệu.");
        }
    }

    public async Task<int> ExecuteAsync(string sql, object? parameters = null)
    {
        using var connection = new SqlConnection(_connectionString);
        return await connection.ExecuteAsync(sql, parameters);
    }

    public async Task<T?> ScalarAsync<T>(string sql, object? parameters = null)
    {
        using var connection = new SqlConnection(_connectionString);
        return await connection.ExecuteScalarAsync<T>(sql, parameters);
    }
}
