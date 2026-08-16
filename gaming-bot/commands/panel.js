const {
  SlashCommandBuilder,
  ContainerBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Post the ticket panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((opt) =>
      opt
        .setName('style')
        .setDescription('Dropdown menu or buttons (defaults to config.json setting)')
        .setRequired(false)
        .addChoices({ name: 'Dropdown', value: 'dropdown' }, { name: 'Buttons', value: 'buttons' })
    ),

  async execute(interaction) {
    const style = interaction.options.getString('style') || config.panel.style || 'dropdown';

    const titleText = config.panel.title ? `## ${config.panel.title}\n` : '';
    const container = new ContainerBuilder()
      .setAccentColor(config.panel.color || '#5865F2')
      .addTextDisplayComponents((td) => td.setContent(`${titleText}${config.panel.description}`));

    if (style === 'buttons') {
      let row = new ActionRowBuilder();
      config.categories.forEach((cat, i) => {
        if (i > 0 && i % 5 === 0) {
          container.addActionRowComponents(row);
          row = new ActionRowBuilder();
        }
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_open_${cat.id}`)
            .setLabel(cat.label)
            .setEmoji(cat.emoji || undefined)
            .setStyle(ButtonStyle.Primary)
        );
      });
      container.addActionRowComponents(row);
    } else {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category_select')
        .setPlaceholder('Select a ticket category…')
        .addOptions(
          config.categories.map((cat) => ({
            label: cat.label,
            description: (cat.description || '').slice(0, 100),
            value: cat.id,
            emoji: cat.emoji || undefined,
          }))
        );
      container.addActionRowComponents((row) => row.addComponents(menu));
    }

    await interaction.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    await interaction.reply({ content: 'Ticket panel posted.', ephemeral: true });
  },
};
