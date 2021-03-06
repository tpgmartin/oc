'use strict';

var cli = require('nomnom');
var commands = require('./commands');
var Local = require('./domain/local');
var Registry = require('./domain/registry');
var _ = require('underscore');

var dependencies = {
  local: new Local(),
  logger: console,
  registry: new Registry()
};

_.forEach(commands, function(commandsConfiguration, commandsConfigurationName){
  
  cli.script(commandsConfigurationName);
  
  _.forEach(commandsConfiguration, function(command, commandName){

    var facade = require('./facade/' + commandName)(dependencies),
        cliCommand = cli.command(commandName).help(command.help).callback(facade),
        c;

    if(!!command.options){
      c = 0;
      cliCommand.options(_.object(_.keys(command.options), _.map(command.options, function(option){
        c++;
        return _.extend(option, {
          list: false,
          position: c,
          required: (option.required === false) ? false : true
        });
      })));
    }

  });
});

cli.parse();